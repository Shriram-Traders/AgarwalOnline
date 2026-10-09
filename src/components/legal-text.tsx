import Link from "next/link";
import type { ReactNode } from "react";

const TOKEN = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;

/**
 * The policy text format: `[label](href)` links and `**bold**`, the rest plain text. No server
 * imports, so the notices inside client forms render with it too. `newTab` is for notices: a
 * policy opened from a half-filled form must not throw the form away.
 */
export function LegalText({ text, newTab = false, mr = false }: { text: string; newTab?: boolean; mr?: boolean }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const [, label, href, bold] = match;
    const key = match.index;
    if (bold) parts.push(<strong key={key}>{bold}</strong>);
    else if (/^https?:/.test(href))
      parts.push(
        <a key={key} href={href} target="_blank" rel="noopener noreferrer">
          {label}
        </a>,
      );
    else if (/^(mailto:|tel:|#)/.test(href))
      parts.push(
        <a key={key} href={href}>
          {label}
        </a>,
      );
    else if (newTab)
      parts.push(
        <Link key={key} href={href} target="_blank" rel="noopener">
          {label}
          <span className="sr-only">{mr ? " (नवीन टॅबमध्ये उघडते)" : " (opens in a new tab)"}</span>
        </Link>,
      );
    else
      parts.push(
        <Link key={key} href={href}>
          {label}
        </Link>,
      );
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
