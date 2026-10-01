"use client";
import { useRef } from "react";

/**
 * A name field with tap-to-fill ideas underneath. It replaces a <datalist>, whose dropdown some
 * browsers draw in the wrong place (even outside the page) and which looks like a menu although
 * the field is free text.
 */
export function NameIdeas({
  name,
  ideas,
  placeholder,
  maxLength = 60,
  ideasLabel,
}: {
  name: string;
  ideas: string[];
  placeholder?: string;
  maxLength?: number;
  /** Heading for the chips, e.g. "Ideas". */
  ideasLabel: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={input} name={name} maxLength={maxLength} required placeholder={placeholder} autoComplete="off" />
      <span className="name-ideas" role="group" aria-label={ideasLabel}>
        <small>{ideasLabel}:</small>
        {ideas.map((idea) => (
          <button
            key={idea}
            type="button"
            className="idea-chip"
            onClick={() => {
              if (!input.current) return;
              input.current.value = idea;
              input.current.focus();
            }}
          >
            {idea}
          </button>
        ))}
      </span>
    </>
  );
}
