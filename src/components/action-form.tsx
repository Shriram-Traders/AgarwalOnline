"use client";
import { useActionState, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { MutationState } from "@/lib/commerce/actions";
import { safeAction } from "./safe-action";

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * React 19 empties a form after every server action, failed or not, so one wrong field threw
 * away everything else that had been typed. React does it through the native, cancelable
 * `reset` event, so a form can refuse it. Use this on forms whose success navigates away or
 * moves to another step, where there is nothing to clear.
 */
export const keepTyped = (event: React.FormEvent) => event.preventDefault();

export function ActionForm({
  action,
  children,
  submit = "Save",
  className = "form-stack",
  buttonClassName = "primary-button",
  confirmMessage,
  danger = false,
  submitIcon,
  onSuccess,
  offlineMessage,
  disabled = false,
}: {
  action: (state: MutationState, form: FormData) => Promise<MutationState>;
  children: React.ReactNode;
  submit?: string;
  className?: string;
  buttonClassName?: string;
  confirmMessage?: React.ReactNode;
  /** The confirm dialog is for deleting: a red button, and on phones a sheet from the bottom. */
  danger?: boolean;
  submitIcon?: React.ReactNode;
  /** Called with the success message, for a parent that replaces the form once it has saved. */
  onSuccess?: (message: string) => void;
  /** What to say when the store can't be reached; defaults to "nothing was lost, tap again". */
  offlineMessage?: string;
  /** Turn the button off when the form can't succeed yet (the page says why). */
  disabled?: boolean;
}) {
  /**
   * React's own reset after a save puts each field back to what the page first drew. A drop-down
   * never learns the saved value (React doesn't move a <select>'s starting choice when the page
   * refreshes), so the colour theme showed the old one after saving and a second Save brought it
   * back. Instead the reset is always refused, and each save that goes through draws the fields
   * afresh (`drawn` keys the form) from the page as it now is: saved values on an edit form,
   * empty boxes on an "add" one.
   */
  const safe = useMemo(() => {
    const save = safeAction(action, offlineMessage);
    return async (previous: MutationState & { drawn?: number }, form: FormData) => {
      const result = await save(previous, form);
      return { ...result, drawn: (previous.drawn ?? 0) + (result.success ? 1 : 0) };
    };
  }, [action, offlineMessage]);
  const [state, dispatch, pending] = useActionState(safe, { drawn: 0 });
  const [confirming, setConfirming] = useState(false);
  const approved = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const messageId = useId();
  const drawn = state.drawn;
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (state.success) onSuccess?.(state.success);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per save, whatever the parent re-renders
  }, [state]);
  // the fresh fields took focus with them; give it back to the button that saved
  useEffect(() => {
    if (drawn && document.activeElement === document.body) button.current?.focus({ preventScroll: true });
  }, [drawn]);

  /** Close without submitting and hand focus back to whatever opened the dialog. */
  const dismiss = useCallback(() => {
    setConfirming(false);
    opener.current?.focus();
  }, []);

  // The dialog is `aria-modal`, so it has to behave like one: take focus on
  // open, keep Tab inside, and close on Escape. Before this it could only be
  // dismissed with a mouse.
  useEffect(() => {
    if (!confirming) return;
    opener.current = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dismiss();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [confirming, dismiss]);

  return (
    <>
      <form
        key={drawn}
        ref={formRef}
        action={dispatch}
        className={className}
        onReset={keepTyped}
        onSubmit={(event) => {
          if (confirmMessage && !approved.current) {
            event.preventDefault();
            setConfirming(true);
          }
          approved.current = false;
        }}
      >
        {children}
        {state.error && <p role="alert" className="error-message">{state.error}</p>}
        {state.success && <p role="status" className="success-message">{state.success}</p>}
        <button ref={button} className={buttonClassName} disabled={pending || disabled} aria-busy={pending}>
          {!pending && submitIcon}
          {pending ? "Please wait…" : submit}
        </button>
      </form>
      {confirming && (
        <div className="modal-backdrop" role="presentation" onMouseDown={dismiss}>
          <div
            ref={dialogRef}
            className={`confirm-modal${danger ? " is-danger" : ""}`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={messageId}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <span className="eyebrow">Please review</span>
            {/* name the exact action: a generic "Are you sure?" gets clicked through */}
            <h2 id={titleId}>{submit}?</h2>
            {typeof confirmMessage === "string" ? <p id={messageId}>{confirmMessage}</p> : <div id={messageId}>{confirmMessage}</div>}
            <div className="split-actions">
              <button type="button" className="secondary-button" onClick={dismiss}>
                No, go back
              </button>
              <button
                ref={confirmRef}
                type="button"
                className={danger ? "primary-button danger-button" : "primary-button"}
                onClick={() => {
                  approved.current = true;
                  setConfirming(false);
                  formRef.current?.requestSubmit();
                }}
              >
                Yes, {submit.charAt(0).toLowerCase() + submit.slice(1)}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
