"use client";
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Search, Send, WifiOff, X } from "lucide-react";
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
/** The day a message was sent, in India: "2026-11-18". */
const istDay = (at: string | Date) =>
  new Date(at).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
/** The chip above a day's messages: "Today", "Yesterday", "13 Nov", or "13 Nov 2025" in another year. */
function dayLabel(day: string) {
  const today = istDay(new Date());
  if (day === today) return "Today";
  if (day === istDay(new Date(Date.now() - 86_400_000))) return "Yesterday";
  const date = new Date(`${day}T12:00:00+05:30`);
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    ...(day.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}),
    timeZone: "Asia/Kolkata",
  });
}
/** A typing box that grows with its text, up to the CSS max-height, then scrolls. */
function fitHeight(box: HTMLTextAreaElement | null) {
  if (!box) return;
  box.style.height = "auto";
  box.style.height = `${box.scrollHeight + 2}px`;
}
/**
 * A conversation with the store. On a customer's phone (`screen`) it is the whole screen, like a
 * messaging app: a bar with Back, the title, the status and search; the messages; the typing box
 * just above the keyboard. Elsewhere (computers, the staff page) it is a card inside the page.
 */
export function ChatPanel({
  conversationId,
  userId,
  staff,
  initial,
  screen,
  notice,
}: {
  conversationId: string;
  userId: string;
  staff: boolean;
  initial: Sync;
  /** The customer's page: draw the phone's top bar with these. */
  screen?: { title: string; status: string; backHref: string };
  /** Shown above the typing box, such as Reopen conversation on a closed chat. */
  notice?: React.ReactNode;
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
  const [searching, setSearching] = useState(false);
  const cursor = useRef(initial.cursor);
  const wake = useRef<() => void>(() => {});
  const panel = useRef<HTMLElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const searchBox = useRef<HTMLInputElement>(null);
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
  // the typing box grows and shrinks with what's in it, including after Send empties it
  useLayoutEffect(() => fitHeight(box.current), [body]);
  useEffect(() => {
    if (searching) searchBox.current?.focus();
  }, [searching]);
  /*
   * The full-screen chat follows the part of the screen the phone shows. When the keyboard opens,
   * Chrome on Android keeps the page's height and only shrinks what's visible, so a screen sized to the
   * page would leave the typing box under the keyboard. The newest message stays in view meanwhile.
   */
  useEffect(() => {
    const viewport = window.visualViewport;
    const element = panel.current;
    if (!screen || !viewport || !element) return;
    const fit = () => {
      const list = log.current;
      const atEnd = !list || list.scrollHeight - list.scrollTop - list.clientHeight < 48;
      element.style.setProperty("--chat-vh", `${Math.round(viewport.height)}px`);
      element.style.setProperty("--chat-top", `${Math.round(viewport.offsetTop)}px`);
      if (atEnd && list) list.scrollTop = list.scrollHeight;
    };
    fit();
    viewport.addEventListener("resize", fit);
    viewport.addEventListener("scroll", fit);
    return () => {
      viewport.removeEventListener("resize", fit);
      viewport.removeEventListener("scroll", fit);
    };
  }, [screen]);
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
    } catch (failure) {
      setError(
        failure instanceof Error && /closed/i.test(failure.message)
          ? failure.message
          : "Message was not confirmed. Your text is kept; press Send to retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  function closeSearch() {
    setSearching(false);
    setQuery("");
  }
  const shown = messages.filter((m) => m.body.toLowerCase().includes(query.toLowerCase()));
  const searchToggle = (
    <button
      type="button"
      className="chat-icon-button"
      aria-label="Search messages"
      aria-expanded={searching}
      aria-controls="chat-search-row"
      onClick={() => (searching ? closeSearch() : setSearching(true))}
    >
      <Search size={19} aria-hidden="true" />
    </button>
  );
  return (
    <section ref={panel} className={screen ? "chat-panel is-screen" : "chat-panel"} aria-label="Conversation with the store">
      {screen && (
        // on a phone the conversation's own bar takes the place of the page heading and the shop's header
        <div className="chat-bar">
          <Link href={screen.backHref} className="chat-icon-button" aria-label="Back to your conversations">
            <ArrowLeft size={20} aria-hidden="true" />
          </Link>
          <div className="chat-bar-title">
            <h1>{screen.title}</h1>
            <p>
              {screen.status}
              {!connected && (
                <>
                  {" · "}
                  <WifiOff size={12} aria-hidden="true" /> Reconnecting…
                </>
              )}
            </p>
          </div>
          {searchToggle}
        </div>
      )}
      <div className="chat-toolbar">
        <span className={connected ? "success-message" : "muted"}>
          {connected ? (
            "Connected to the store"
          ) : (
            <>
              <WifiOff size={14} aria-hidden="true" /> Reconnecting
            </>
          )}
        </span>
        {searchToggle}
      </div>
      {searching && (
        <div className="chat-search" id="chat-search-row">
          <label className="sr-only" htmlFor="chat-search">
            Search loaded messages
          </label>
          <Search size={16} aria-hidden="true" />
          <input
            ref={searchBox}
            id="chat-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") closeSearch();
            }}
            placeholder="Search messages"
            autoComplete="off"
          />
          <button type="button" className="chat-icon-button" aria-label="Close search" onClick={closeSearch}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      )}
      <div
        ref={log}
        className="chat-messages"
        role="log"
        aria-label="Conversation messages"
        aria-live="polite"
      >
        {shown.map((m, index) => {
          const read = receipts.some(
            (r) => r.userId !== userId && r.read >= m.sequence,
          );
          const delivered = receipts.some(
            (r) => r.userId !== userId && r.delivered >= m.sequence,
          );
          const day = istDay(m.createdAt);
          const newDay = index === 0 || istDay(shown[index - 1].createdAt) !== day;
          return (
            <Fragment key={m.id}>
              {newDay && (
                <p className="chat-day">
                  <span suppressHydrationWarning>{dayLabel(day)}</span>
                </p>
              )}
              <article
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
            </Fragment>
          );
        })}
        {query && !shown.length && messages.length > 0 && (
          <p className="muted chat-empty">No messages match “{query}”.</p>
        )}
        {!messages.length &&
          (staff ? (
            <p className="muted chat-empty">No messages yet. The customer’s first message shows here, and your reply goes below.</p>
          ) : (
            <div className="chat-empty">
              <p className="muted">Tell us how we can help.</p>
              <PolicyNotice kind="chat" />
            </div>
          ))}
        <div ref={end} />
      </div>
      {typing && <p className="typing-label">Someone is typing…</p>}
      {error && (
        <p role="status" className="error-message">
          {error}
        </p>
      )}
      {notice && <div className="chat-notice">{notice}</div>}
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
          ref={box}
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
          rows={1}
          required
        />
        <button
          className="primary-button chat-send"
          disabled={!connected || busy || !body.trim()}
          aria-busy={busy}
        >
          <Send size={18} aria-hidden="true" />
          <span className="chat-send-label">{busy ? "Sending…" : "Send"}</span>
        </button>
      </form>
    </section>
  );
}
