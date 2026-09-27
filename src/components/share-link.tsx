"use client";

import { useId, useRef, useState } from "react";
import { Share2 } from "lucide-react";

/** A link to hand to someone: the share sheet on phones, the clipboard elsewhere. */
export function ShareLink({
  label,
  url,
  hint,
  title,
  copy,
  copied,
}: {
  label: string;
  url: string;
  hint: string;
  /** What the share sheet calls it. */
  title: string;
  copy: string;
  copied: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [done, setDone] = useState(false);
  async function share() {
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      await navigator.share({ title, url }).catch(() => {});
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch {
      // no clipboard access: leave the link selected to copy by hand
      input.current?.select();
    }
  }
  return (
    <div className="share-field">
      <label htmlFor={id}>{label}</label>
      <div>
        <input ref={input} id={id} value={url} readOnly onFocus={(event) => event.currentTarget.select()} />
        <button type="button" className="secondary-button" onClick={share}>
          <Share2 size={16} aria-hidden="true" />
          <span aria-live="polite">{done ? copied : copy}</span>
        </button>
      </div>
      <small>{hint}</small>
    </div>
  );
}
