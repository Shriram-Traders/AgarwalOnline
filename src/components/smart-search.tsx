"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowUpRight, Clock, Mic, Search, TrendingUp, X } from "lucide-react";
import { formatPrice } from "@/lib/display";

type Suggestion = {
  slug: string;
  name: { en: string; mr: string };
  brand: string;
  pricePaise: number;
  /** Said instead of the price, e.g. "₹42.50 + GST" in the school marketplace. */
  priceText?: string;
};

// ---- recent searches: kept on this device only, newest first ----
const RECENT_KEY = "ags-recent-searches";
const RECENT_MAX = 6;
function readRecent(key: string): string[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}
function writeRecent(key: string, list: string[]) {
  try {
    if (list.length) window.localStorage.setItem(key, JSON.stringify(list));
    else window.localStorage.removeItem(key);
  } catch {
    // private windows can refuse storage: recent searches simply aren't kept
  }
}

// ---- voice search: Chrome on Android and computers; hidden where the browser can't listen ----
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
};
type RecognitionClass = new () => Recognition;
function recognitionClass(): RecognitionClass | undefined {
  const w = window as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}
const noSubscribe = () => () => {};
const canListen = () => Boolean(recognitionClass());
const cannotListen = () => false;

/** The page's language, from <html lang>; the search box itself is told only its placeholder. */
const pageIsMarathi = () => document.documentElement.lang === "mr";
const WORDS = {
  en: {
    recent: "Recent searches",
    popular: "Popular searches",
    clear: "Clear",
    all: "See all results",
    listen: "Search by voice",
    stop: "Stop listening",
    listening: "Listening… say what you need.",
    denied: "Allow the microphone to search by voice.",
    missed: "Didn’t catch that. Tap the microphone and try again.",
    failed: "Voice search isn’t working right now. Type instead.",
  },
  mr: {
    recent: "अलीकडील शोध",
    popular: "लोकप्रिय शोध",
    clear: "पुसा",
    all: "सर्व निकाल पाहा",
    listen: "बोलून शोधा",
    stop: "ऐकणे थांबवा",
    listening: "ऐकत आहोत… काय हवे ते बोला.",
    denied: "बोलून शोधण्यासाठी मायक्रोफोनला परवानगी द्या.",
    missed: "नीट ऐकू आले नाही. मायक्रोफोन दाबून पुन्हा बोला.",
    failed: "आत्ता बोलून शोधता येत नाही. टाइप करा.",
  },
};

/**
 * The header search with live suggestions. Opened empty, it offers this device's recent searches
 * and the shop's popular ones; the microphone searches by voice in English or Marathi. The shop's
 * is the default; the school marketplace points it at its own catalogue, suggestions and product pages.
 */
export function SmartSearch({
  placeholder,
  hints = [],
  label = "Search products",
  action = "/catalog",
  suggestUrl = "/api/catalog/suggestions",
  productBase = "/products/",
}: {
  placeholder: string;
  /** Rotated through the placeholder, and offered as popular searches. */
  hints?: string[];
  label?: string;
  action?: string;
  suggestUrl?: string;
  productBase?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hint, setHint] = useState(0);
  useEffect(() => {
    if (hints.length < 2 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setHint((i) => (i + 1) % hints.length), 2600);
    return () => window.clearInterval(timer);
  }, [hints.length]);
  const [results, setResults] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [listening, setListening] = useState(false);
  const [voiceNote, setVoiceNote] = useState("");
  const voiceSupported = useSyncExternalStore(noSubscribe, canListen, cannotListen);
  const recognition = useRef<Recognition | null>(null);
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  // the shop and the school marketplace keep separate recent searches
  const recentKey = action === "/catalog" ? RECENT_KEY : `${RECENT_KEY}:${action}`;
  useEffect(() => {
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `${suggestUrl}?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
        if (response.ok) setResults(await response.json());
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          setResults([]);
      }
    }, 220);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, suggestUrl]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  // a voice search still listening when the page changes stops
  useEffect(() => () => recognition.current?.abort(), []);

  const remember = (text: string) => {
    const value = text.trim().replace(/\s+/g, " ").slice(0, 100);
    if (value.length < 2) return;
    const next = [value, ...readRecent(recentKey).filter((item) => item.toLowerCase() !== value.toLowerCase())].slice(0, RECENT_MAX);
    writeRecent(recentKey, next);
    setRecent(next);
  };
  const searchFor = (text: string) => {
    remember(text);
    setOpen(false);
    router.push(`${action}?q=${encodeURIComponent(text.trim())}`);
  };

  function toggleVoice() {
    const words = WORDS[pageIsMarathi() ? "mr" : "en"];
    if (listening) {
      recognition.current?.abort();
      setListening(false);
      setVoiceNote("");
      return;
    }
    const Speech = recognitionClass();
    if (!Speech) return;
    const listener = new Speech();
    listener.lang = pageIsMarathi() ? "mr-IN" : "en-IN";
    listener.interimResults = true;
    listener.continuous = false;
    listener.maxAlternatives = 1;
    let heard = "";
    listener.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      heard = last[0].transcript;
      setQuery(heard);
      if (last.isFinal && heard.trim()) {
        setVoiceNote("");
        searchFor(heard);
      }
    };
    listener.onerror = (event) => {
      setVoiceNote(event.error === "not-allowed" || event.error === "service-not-allowed" ? words.denied : event.error === "no-speech" ? words.missed : event.error === "aborted" ? "" : words.failed);
    };
    listener.onend = () => {
      setListening(false);
      recognition.current = null;
    };
    recognition.current = listener;
    try {
      listener.start();
      setListening(true);
      setVoiceNote(words.listening);
    } catch {
      setVoiceNote(words.failed);
    }
  }

  const expanded = open && results.length > 0;
  const starting = open && query.trim().length < 2 && (recent.length > 0 || hints.length > 0);
  const pathname = usePathname();
  const under = (path: string) => pathname === path || pathname.startsWith(`${path}/`);
  // the account pages are about the shopper, not the shelves, and checkout is for finishing
  // the order: no product search on either
  if (under("/account") || under("/checkout") || under("/school/checkout")) return null;
  // the basket keeps it on a computer, where it sits in the header row; a phone gives the
  // pinned row to the items and the bill (styled in globals.css)
  const phoneHidden = under("/cart") || under("/school/basket");
  // the page's language is only read in the browser: once the box is open, or once it's known the
  // browser can listen (never during the server's render or hydration)
  const words = WORDS[(open || voiceSupported) && pageIsMarathi() ? "mr" : "en"];
  return (
    <div
      className={phoneHidden ? "smart-search phone-hidden" : "smart-search"}
      ref={root}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <form action={action} className="search" role="search" onSubmit={() => remember(query)}>
        <Search size={20} aria-hidden="true" />
        <input
          name="q"
          value={query}
          onChange={(event) => {
            const value = event.target.value;
            setQuery(value);
            if (value.trim().length < 2) setResults([]);
            setOpen(true);
          }}
          onFocus={() => {
            setRecent(readRecent(recentKey));
            setOpen(true);
          }}
          aria-label={label}
          role="combobox"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          enterKeyHint="search"
          placeholder={hints.length ? `${placeholder} · “${hints[hint]}”` : placeholder}
          maxLength={100}
        />
        {voiceSupported && !query && (
          <button
            type="button"
            className={listening ? "search-voice is-listening" : "search-voice"}
            onClick={toggleVoice}
            aria-label={listening ? words.stop : words.listen}
            aria-pressed={listening}
            title={listening ? words.stop : words.listen}
          >
            <Mic size={18} aria-hidden="true" />
          </button>
        )}
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setResults([]);
            }}
            aria-label="Clear search"
          >
            <X size={18} />
          </button>
        ) : (
          <button aria-label="Search">
            <Search size={18} />
          </button>
        )}
      </form>
      {voiceNote && (
        <p className="search-voice-note" role="status">
          {voiceNote}
        </p>
      )}
      {expanded && (
        <div className="search-popover" id={listId} role="listbox" aria-label="Suggestions">
          {results.map((result) => (
            <Link
              key={result.slug}
              href={`${productBase}${result.slug}`}
              role="option"
              aria-selected={false}
              onClick={() => {
                remember(query);
                setOpen(false);
              }}
            >
              <span>
                <strong>{result.name.en}</strong>
                <small>
                  {result.name.mr} · {result.brand}
                </small>
              </span>
              <b>{result.priceText ?? formatPrice(result.pricePaise)}</b>
            </Link>
          ))}
          <Link
            className="search-all"
            href={`${action}?q=${encodeURIComponent(query)}`}
            onClick={() => {
              remember(query);
              setOpen(false);
            }}
          >
            {words.all} <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
      )}
      {starting && !expanded && (
        // each list below is its own named region; the box around them needs no name of its own
        <div className="search-popover search-start">
          {recent.length > 0 && (
            <section aria-label={words.recent}>
              <div className="search-start-head">
                <span>{words.recent}</span>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    writeRecent(recentKey, []);
                    setRecent([]);
                  }}
                >
                  {words.clear}
                </button>
              </div>
              <ul className="search-chips">
                {recent.map((item) => (
                  <li key={item}>
                    <Link href={`${action}?q=${encodeURIComponent(item)}`} onClick={() => {
                        remember(item);
                        setOpen(false);
                      }}>
                      <Clock size={14} aria-hidden="true" /> {item}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {hints.length > 0 && (
            <section aria-label={words.popular}>
              <div className="search-start-head">
                <span>{words.popular}</span>
              </div>
              <ul className="search-chips">
                {hints.map((item) => (
                  <li key={item}>
                    <Link href={`${action}?q=${encodeURIComponent(item)}`} onClick={() => {
                        remember(item);
                        setOpen(false);
                      }}>
                      <TrendingUp size={14} aria-hidden="true" /> {item}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
