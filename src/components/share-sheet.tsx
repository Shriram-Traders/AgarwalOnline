"use client";

import { useId, useRef, type ReactNode } from "react";
import { Share2, X } from "lucide-react";

/**
 * One Share button for a list. The native <dialog> brings focus trapping,
 * Escape and a backdrop; it stays open while the forms inside revalidate.
 */
export function ShareSheet({
  label,
  title,
  closeLabel,
  trigger,
  triggerClassName = "secondary-button",
  children,
}: {
  label: string;
  title: string;
  closeLabel: string;
  /** Richer trigger content (faces and a line of text); `label` names it for screen readers then. */
  trigger?: ReactNode;
  triggerClassName?: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  return (
    <>
      <button
        type="button"
        className={triggerClassName}
        aria-label={trigger ? label : undefined}
        onClick={() => dialog.current?.showModal()}
      >
        {trigger ?? (
          <>
            <Share2 size={16} aria-hidden="true" /> {label}
          </>
        )}
      </button>
      <dialog
        ref={dialog}
        className="share-sheet"
        aria-labelledby={titleId}
        // a tap on the backdrop lands on the dialog itself; taps on the content never do
        onClick={(event) => event.target === event.currentTarget && dialog.current?.close()}
      >
        <div className="share-sheet-body">
          <div className="share-sheet-head">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="icon-button" aria-label={closeLabel} onClick={() => dialog.current?.close()}>
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          {children}
        </div>
      </dialog>
    </>
  );
}
