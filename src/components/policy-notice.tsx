import { notice, type NoticeKind } from "@/lib/legal/notices";
import type { Locale } from "@/lib/locale-types";
import { LegalText } from "./legal-text";

/** The line under a form saying how what you send is used, linking the policies in a new tab. */
export function PolicyNotice({
  kind,
  locale = "en",
  days,
  google,
  className = "form-notice",
}: {
  kind: NoticeKind;
  locale?: Locale;
  /** How long photos are kept, for the evidence notice. */
  days?: number;
  /** Whether "Continue with Google" is on the page, for the sign-in notices. */
  google?: boolean;
  className?: string;
}) {
  return (
    <p className={className}>
      <LegalText text={notice(kind, locale, { days, google })} newTab mr={locale === "mr"} />
    </p>
  );
}
