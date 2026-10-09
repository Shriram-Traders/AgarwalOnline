"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { MutationState } from "@/lib/commerce/actions";
import Link from "next/link";
import { ActionForm } from "./action-form";

/*
 * Sending reads what is saved, not what is typed. Without this, a quantity or price changed
 * but not saved would quietly go out at its old value. Boxes report unsaved edits here, and
 * the send button waits until there are none.
 */

type Unsaved = { mark: (key: string, dirty: boolean) => void; count: number };
const UnsavedContext = createContext<Unsaved>({ mark: () => {}, count: 0 });

export function UnsavedProvider({ children }: { children: React.ReactNode }) {
  const [dirty, setDirty] = useState<ReadonlySet<string>>(new Set());
  const mark = useCallback((key: string, isDirty: boolean) => {
    setDirty((current) => {
      if (current.has(key) === isDirty) return current;
      const next = new Set(current);
      if (isDirty) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);
  const value = useMemo(() => ({ mark, count: dirty.size }), [mark, dirty]);
  return <UnsavedContext.Provider value={value}>{children}</UnsavedContext.Provider>;
}

/** Report whether `key` has unsaved edits; clears itself when the box goes away. */
export function useUnsaved(key: string, dirty: boolean) {
  const { mark } = useContext(UnsavedContext);
  useEffect(() => {
    mark(key, dirty);
  }, [mark, key, dirty]);
  useEffect(() => () => mark(key, false), [mark, key]);
}

/** An ActionForm whose button waits until every reported edit is saved. */
export function SendWhenSaved({
  waiting,
  ...props
}: React.ComponentProps<typeof ActionForm> & {
  /** Said while edits are unsaved, e.g. "Save your changes first, then send." */
  waiting: string;
  action: (state: MutationState, form: FormData) => Promise<MutationState>;
}) {
  const { count } = useContext(UnsavedContext);
  return (
    <>
      {count > 0 && (
        <p className="notice unsaved-note" role="status">
          {waiting}
        </p>
      )}
      <ActionForm {...props} disabled={props.disabled || count > 0} />
    </>
  );
}

/** A link onward (e.g. to checkout) that waits, like SendWhenSaved, until every edit is saved. */
export function ProceedWhenSaved({
  href,
  className,
  waiting,
  disabled = false,
  children,
}: {
  href: string;
  className: string;
  waiting: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const { count } = useContext(UnsavedContext);
  if (disabled || count > 0)
    return (
      <>
        {count > 0 && (
          <p className="notice unsaved-note" role="status">
            {waiting}
          </p>
        )}
        <span className={`${className} is-waiting`} aria-disabled="true">
          {children}
        </span>
      </>
    );
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
