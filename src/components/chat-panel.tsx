"use client";
import { useEffect, useRef, useState } from "react";
import { Send, WifiOff } from "lucide-react";
import type { MessageDTO } from "@/lib/chat/service";
import { PolicyNotice } from "./policy-notice";
type Sync = {
  messages: MessageDTO[];
  cursor: number;
  hasMore: boolean;
  status: string;
  receipts: { userId: string; delivered: number; read: number }[];
  typing: boolean;
};
// ponytail: plain polling, no push server; 4s while active, 12s after a quiet minute, paused in hidden tabs.
// Move to server-sent events or a hosted push service if replies ever need to be instant.
const ACTIVE_POLL = 4000;
const IDLE_POLL = 12000;
async function chat<T>(
  conversationId: string,
  body?: Record<string, unknown>,
  after = 0,
): Promise<T> {
  const response = await fetch(
    `/api/chat/${conversationId}${body ? "" : `?after=${after}`}`,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) throw Error(result.error);
  return result.data;
}
const mergeMessages = (current: MessageDTO[], incoming: MessageDTO[]) => {
  const map = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) map.set(m.id, m);
  return [...map.values()].sort((a, b) => a.sequence - b.sequence);
};
/**
 * A UUID for a message being sent. crypto.randomUUID only exists on https and localhost pages,
 * so a phone opening the dev server by the PC's Wi-Fi address (plain http) builds one itself.
 */
function messageId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 9562 variant
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function ChatPanel({
  conversationId,
  userId,
  staff,
  initial,
}: {
  conversationId: string;
  userId: string;
  staff: boolean;
  initial: Sync;
}) {
  const [messages, setMessages] = useState(initial.messages);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(initial.typing);
  const [receipts, setReceipts] = useState(initial.receipts);
  const [query, setQuery] = useState("");
  const cursor = useRef(initial.cursor);
  const wake = useRef<() => void>(() => {});
  const end = useRef<HTMLDivElement>(null);
  const typingAt = useRef(0);
  const pending = useRef<{
    id: string;
    body: string;
    internal: boolean;
  } | null>(null);
  useEffect(() => {
    let active = true;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastActivity = Date.now();
    const reported = { delivered: 0, read: 0 };
    async function sync() {
      if (running) return;
      running = true;
      clearTimeout(timer);
      try {
        const before = cursor.current;
        let more = true;
        while (more && active) {
          const data = await chat<Sync>(conversationId, undefined, cursor.current);
          setMessages((current) => mergeMessages(current, data.messages));
          cursor.current = data.cursor;
          setReceipts(data.receipts);
          setTyping(data.typing);
          more = data.hasMore;
        }
        if (cursor.current > before) lastActivity = Date.now();
        const read = document.visibilityState === "visible";
        if (
          active &&
          (cursor.current > reported.delivered ||
            (read && cursor.current > reported.read))
        ) {
          await chat(conversationId, {
            type: "receipt",
            sequence: cursor.current,
            read,
          });
          reported.delivered = cursor.current;
          if (read) reported.read = cursor.current;
        }
        if (active) {
          setConnected(true);
          setError("");
        }
      } catch {
        if (active) {
          setConnected(false);
          setError(
            "Support is offline. Saved messages are shown below; reconnecting…",
          );
        }
      } finally {
        running = false;
      }
      if (active && document.visibilityState === "visible")
        timer = setTimeout(
          sync,
          Date.now() - lastActivity < 60000 ? ACTIVE_POLL : IDLE_POLL,
        );
    }
    wake.current = () => {
      lastActivity = Date.now();
      void sync();
    };
    const visible = () => {
      if (document.visibilityState === "visible") void sync();
    };
    document.addEventListener("visibilitychange", visible);
    void sync();
    return () => {
      active = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [conversationId]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);
  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!connected || !body.trim() || busy) return;
    setBusy(true);
    setError("");
    if (
      !pending.current ||
      pending.current.body !== body ||
      pending.current.internal !== internal
    ) {
      pending.current = { id: messageId(), body, internal };
    }
    const sent = pending.current;
    try {
      const message = await chat<MessageDTO>(conversationId, {
        type: "send",
        clientMessageId: sent.id,
        body: sent.body,
        internal: sent.internal,
      });
      setMessages((current) => mergeMessages(current, [message]));
      setBody((draft) => (draft === sent.body ? "" : draft));
      pending.current = null;
      typingAt.current = 0;
      wake.current();
    } catch {
      setError(
        "Message was not confirmed. Your text is kept; press Send to retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="chat-panel">
      <div className="chat-toolbar">
        <span className={connected ? "success-message" : "muted"}>
          {connected ? (
            "Connected to the store"
          ) : (
            <>
              <WifiOff size={14} /> Reconnecting
            </>
          )}
        </span>
        <label className="sr-only" htmlFor="chat-search">
          Search loaded messages
        </label>
        <input
          id="chat-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search messages…"
        />
      </div>
      <div
        className="chat-messages"
        role="log"
        aria-label="Conversation messages"
        aria-live="polite"
      >
        {messages
          .filter((m) => m.body.toLowerCase().includes(query.toLowerCase()))
          .map((m) => {
            const read = receipts.some(
              (r) => r.userId !== userId && r.read >= m.sequence,
            );
            const delivered = receipts.some(
              (r) => r.userId !== userId && r.delivered >= m.sequence,
            );
            return (
              <article
                key={m.id}
                className={`chat-message ${m.senderId === userId ? "mine" : ""} ${m.internal ? "internal" : ""}`}
              >
                <small>
                  {m.internal ? "Internal team note" : m.senderName}
                </small>
                <p>{m.body}</p>
                <small>
                  {new Date(m.createdAt).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Asia/Kolkata",
                  })}
                  {m.senderId === userId
                    ? ` · ${read ? "Read" : delivered ? "Delivered" : "Sent"}`
                    : ""}
                </small>
              </article>
            );
          })}
        {!messages.length &&
          (staff ? (
            <p className="muted">
              Tell us how we can help. Your messages are saved securely.
            </p>
          ) : (
            <>
              <p className="muted">Tell us how we can help.</p>
              <PolicyNotice kind="chat" />
            </>
          ))}
        <div ref={end} />
      </div>
      {typing && <p className="typing-label">Someone is typing…</p>}
      {error && (
        <p role="status" className="error-message">
          {error}
        </p>
      )}
      <form onSubmit={send} className="chat-compose">
        {staff && (
          <label className="internal-toggle">
            <input
              type="checkbox"
              checked={internal}
              onChange={(e) => setInternal(e.target.checked)}
            />
            Internal note
          </label>
        )}
        <label className="sr-only" htmlFor="chat-message">
          Your message
        </label>
        <textarea
          id="chat-message"
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            if (connected && Date.now() - typingAt.current > 3000) {
              typingAt.current = Date.now();
              chat(conversationId, {
                type: "typing",
                typing: !!e.target.value,
              }).catch(() => {});
            }
          }}
          maxLength={2000}
          placeholder={
            internal ? "Private note for the store team…" : "Write a message…"
          }
          rows={2}
          required
        />
        <button
          className="primary-button"
          disabled={!connected || busy || !body.trim()}
        >
          <Send size={17} />
          {busy ? "Sending…" : "Send"}
        </button>
      </form>
    </section>
  );
}
