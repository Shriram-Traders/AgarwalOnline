"use client";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { RotateCcw, Send, Sparkles, X } from "lucide-react";
import { askAssistant, assistantHandoffAction } from "@/lib/assistant/actions";
import { assistantCopy, type AssistantCopy } from "@/lib/assistant/copy";
import { TOPICS, type Bubble, type Intent } from "@/lib/assistant/types";
import { formatPrice } from "@/lib/display";
import type { Locale } from "@/lib/locale-types";
import { ActionForm } from "./action-form";
import { AisleIcon } from "./aisle-icon";
import { PolicyNotice } from "./policy-notice";
import { QuickAdd } from "./quick-add";

type Message = { id: string; who: "me"; text: string } | { id: string; who: "bot"; bubble: Bubble };

const KEY = "ags-assistant";
/** Places with their own help, or where a floating button would get in the way. */
const QUIET = ["/admin", "/super-admin", "/delivery", "/staff", "/checkout", "/account/support", "/login", "/signup", "/school"];

let sequence = 0;
const nextId = () => `m${Date.now().toString(36)}${(sequence++).toString(36)}`;

/** The chat kept in this tab, so it survives moving between pages. Storage can be blocked. */
function stored(): Message[] | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
    return Array.isArray(value) && value.length ? (value as Message[]) : null;
  } catch {
    return null;
  }
}

/**
 * The shop assistant in the bottom-right corner. It answers delivery, payment, order and
 * returns questions from the shop's own settings, finds products with an Add button, and
 * passes signed-in shoppers to the store's live chat. On phones it opens as a bottom sheet.
 */
export function ShopAssistant({ locale, signedIn }: { locale: Locale; signedIn: boolean }) {
  const pathname = usePathname();
  const t = assistantCopy[locale];
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const launcher = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const titleId = useId();
  const fieldId = useId();

  const greeting = (): Message[] => [
    { id: nextId(), who: "bot", bubble: { kind: "text", text: t.greeting } },
    { id: nextId(), who: "bot", bubble: { kind: "chips" } },
  ];

  useEffect(() => {
    if (!messages.length) return;
    try {
      sessionStorage.setItem(KEY, JSON.stringify(messages.slice(-40)));
    } catch {
      // private mode or blocked storage: the chat just starts fresh next page
    }
  }, [messages]);

  useEffect(() => {
    if (open) log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [messages, open, pending]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      launcher.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (QUIET.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return null;

  function openPanel() {
    setMessages((current) => (current.length ? current : (stored() ?? greeting())));
    setOpen(true);
    // the typing box on a computer; on a phone the keyboard would cover the answers
    requestAnimationFrame(() =>
      window.matchMedia("(min-width: 761px)").matches ? field.current?.focus() : panel.current?.focus(),
    );
  }
  function closePanel() {
    setOpen(false);
    launcher.current?.focus();
  }
  function startOver() {
    setMessages(greeting());
    field.current?.focus();
  }
  function ask(payload: { text?: string; intent?: Intent }, shown: string) {
    setMessages((current) => [...current, { id: nextId(), who: "me", text: shown }]);
    startTransition(async () => {
      const reply = await askAssistant(payload).catch(() => ({
        bubbles: [{ kind: "text", text: t.offline } as Bubble],
      }));
      startTransition(() =>
        setMessages((current) => [
          ...current,
          ...reply.bubbles.map((bubble) => ({ id: nextId(), who: "bot" as const, bubble })),
        ]),
      );
    });
  }

  return (
    <>
      <button
        ref={launcher}
        type="button"
        className="assistant-launcher"
        aria-label={open ? t.close : t.launcher}
        title={open ? t.close : t.launcher}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => (open ? closePanel() : openPanel())}
      >
        {open ? <X size={24} aria-hidden="true" /> : <Sparkles size={24} aria-hidden="true" />}
      </button>
      {open && (
        <>
          <div className="assistant-backdrop" aria-hidden="true" onClick={closePanel} />
          <section ref={panel} id={panelId} className="assistant-panel" role="dialog" aria-labelledby={titleId} tabIndex={-1}>
            <div className="assistant-head">
              <span className="assistant-mark" aria-hidden="true">
                <Sparkles size={18} />
              </span>
              <span>
                <strong id={titleId}>{t.title}</strong>
                <small>{t.subtitle}</small>
              </span>
              <button type="button" className="assistant-icon-button" onClick={startOver} aria-label={t.startOver} title={t.startOver}>
                <RotateCcw size={18} aria-hidden="true" />
              </button>
              <button type="button" className="assistant-icon-button" onClick={closePanel} aria-label={t.close} title={t.close}>
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <div ref={log} className="assistant-log" aria-live="polite" aria-busy={pending}>
              {messages.map((message) =>
                message.who === "me" ? (
                  <p key={message.id} className="assistant-msg me">
                    <span className="sr-only">{t.you}: </span>
                    {message.text}
                  </p>
                ) : (
                  <BotBubble
                    key={message.id}
                    bubble={message.bubble}
                    t={t}
                    locale={locale}
                    signedIn={signedIn}
                    pathname={pathname}
                    pending={pending}
                    onTopic={(topic) => ask({ intent: topic }, t.topics[topic])}
                    onLeave={() => setOpen(false)}
                  />
                ),
              )}
              {pending && <p className="assistant-msg bot assistant-thinking">{t.thinking}</p>}
            </div>
            <form
              className="assistant-form"
              onSubmit={(event) => {
                event.preventDefault();
                const text = draft.trim();
                if (!text || pending) return;
                setDraft("");
                ask({ text }, text);
              }}
            >
              <label className="sr-only" htmlFor={fieldId}>
                {t.placeholder}
              </label>
              <input
                ref={field}
                id={fieldId}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={300}
                placeholder={t.placeholder}
                autoComplete="off"
                enterKeyHint="send"
              />
              <button type="submit" aria-label={t.send} title={t.send} disabled={!draft.trim() || pending}>
                <Send size={18} aria-hidden="true" />
              </button>
            </form>
          </section>
        </>
      )}
    </>
  );
}

function BotBubble({
  bubble,
  t,
  locale,
  signedIn,
  pathname,
  pending,
  onTopic,
  onLeave,
}: {
  bubble: Bubble;
  t: AssistantCopy;
  locale: Locale;
  signedIn: boolean;
  pathname: string;
  pending: boolean;
  onTopic: (topic: (typeof TOPICS)[number]) => void;
  /** Following a link closes the chat; adding to the basket doesn't. */
  onLeave: () => void;
}) {
  const back = encodeURIComponent(pathname);
  const signIn = (text: string) => (
    <div className="assistant-msg bot">
      <p>{text}</p>
      <div className="assistant-actions">
        <Link className="primary-button compact-button" href={`/login?then=${back}`} onClick={onLeave}>
          {t.signIn}
        </Link>
        <Link className="secondary-button compact-button" href={`/signup?then=${back}`} onClick={onLeave}>
          {t.signUp}
        </Link>
      </div>
    </div>
  );
  switch (bubble.kind) {
    case "text":
      return (
        <div className="assistant-msg bot">
          <p>{bubble.text}</p>
          {bubble.links?.length ? (
            <ul className="assistant-links">
              {bubble.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} onClick={onLeave}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      );
    case "chips":
      return (
        <div className="assistant-chips">
          {TOPICS.map((topic) => (
            <button key={topic} type="button" disabled={pending} onClick={() => onTopic(topic)}>
              {t.topics[topic]}
            </button>
          ))}
        </div>
      );
    case "products":
      return (
        <>
          <ul className="assistant-products">
            {bubble.items.map((item) => (
              <li key={item.variantId}>
                <span className="assistant-thumb">
                  {item.image ? (
                    <Image src={item.image} alt="" width={48} height={48} />
                  ) : (
                    <AisleIcon slug={item.categorySlug} />
                  )}
                </span>
                <Link href={`/products/${item.slug}`} onClick={onLeave}>
                  <strong>{item.name}</strong>
                  <small>
                    {item.label} · <span className="assistant-price">{formatPrice(item.pricePaise)}</span>
                  </small>
                </Link>
                <QuickAdd
                  variantId={item.variantId}
                  pricePaise={item.pricePaise}
                  available={item.available}
                  max={item.maxQuantity}
                  name={item.name}
                />
              </li>
            ))}
          </ul>
          {bubble.more && (
            <Link className="assistant-more" href={bubble.more.href} onClick={onLeave}>
              {bubble.more.label}
            </Link>
          )}
        </>
      );
    case "sign-in":
      return signIn(bubble.text);
    case "handoff":
      // a chat restored from before signing out can still show this
      if (!signedIn) return signIn(t.humanSignIn);
      return (
        <div className="assistant-msg bot">
          <p>{bubble.text}</p>
          <ActionForm
            action={assistantHandoffAction}
            submit={t.handoffButton}
            className="form-stack assistant-handoff"
            buttonClassName="primary-button compact-button"
          >
            {bubble.question && <input type="hidden" name="question" value={bubble.question} />}
            <PolicyNotice kind="handoff" locale={locale} />
          </ActionForm>
        </div>
      );
  }
}
