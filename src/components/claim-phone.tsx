"use client";
import { useActionState, useState } from "react";
import { claimPhoneSendAction, claimPhoneVerifyAction } from "@/lib/auth/actions";
import { keepTyped } from "@/components/action-form";
import { safeAction } from "@/components/safe-action";

const sendClaimCode = safeAction(claimPhoneSendAction);
const verifyClaimCode = safeAction(claimPhoneVerifyAction);

/**
 * For people who joined with Google: add a mobile number, or, if that number already has an
 * account, verify it to bring that account (and its orders) to this Google sign-in.
 */
type Props = {
  mr?: boolean;
  welcome?: boolean;
  /** "address": the number was just typed on the address form and its code is already on the way. */
  context?: "account" | "address";
  /** Opens on the code step for a number whose code was already sent. */
  initial?: { phone: string; newAccount: boolean };
};
export function ClaimPhone(props: Props) {
  // "send a new code" remounts the form on its first step
  const [restarted, setRestarted] = useState(0);
  return (
    <ClaimPhoneSteps
      key={restarted}
      {...props}
      initial={restarted ? undefined : props.initial}
      onRestart={() => setRestarted((n) => n + 1)}
    />
  );
}
function ClaimPhoneSteps({
  mr = false,
  welcome = false,
  context = "account",
  initial,
  onRestart,
}: Props & { onRestart: () => void }) {
  const [sent, send, sending] = useActionState(
    sendClaimCode,
    initial ? { ...initial, challengeId: "better-auth" } : {},
  );
  const [verified, verify, verifying] = useActionState(verifyClaimCode, {});
  const fromAddress = context === "address";
  return (
    <section
      className={`panel claim-phone${welcome || fromAddress ? " attention" : ""}`}
      aria-labelledby="claim-phone-title"
    >
      <h2 id="claim-phone-title">
        {fromAddress
          ? mr
            ? "साइन इनसाठी हा क्रमांक पडताळा"
            : "Verify this number to sign in with it"
          : mr
            ? "आधी आमच्याकडून ऑर्डर केले आहे?"
            : "Ordered with us before?"}
      </h2>
      <p className="muted">
        {fromAddress
          ? mr
            ? "पत्ता जतन झाला. या क्रमांकावर कोड पाठवला आहे; तो टाकल्यावर तुम्ही या क्रमांकानेही साइन इन करू शकाल."
            : "Your address is saved. We sent a code to this number; enter it and you can sign in with this number too."
          : mr
            ? "तेव्हा वापरलेला मोबाईल क्रमांक पडताळा. त्या खात्यातील ऑर्डर येथे दिसतील आणि Google त्याच खात्यात साइन इन करेल. नवीन असाल तर हा क्रमांक तुमच्या खात्यात जोडला जाईल."
            : "Verify the mobile number you used then. That account’s orders come here and Google signs you in to it from now on. If you’re new, the number is simply added to this account."}
      </p>
      {!sent.challengeId ? (
        <form action={send} onReset={keepTyped} className="form-stack">
          <label>
            {mr ? "मोबाईल क्रमांक" : "Mobile number"}
            <div className="phone-input">
              <span>+91</span>
              <input
                name="phone"
                type="tel"
                inputMode="numeric"
                pattern="[6-9][0-9]{9}"
                maxLength={10}
                autoComplete="tel-national"
                defaultValue={sent.phone}
                placeholder={mr ? "१० अंकी मोबाईल क्रमांक" : "10-digit mobile number"}
                required
              />
            </div>
          </label>
          {sent.error && <p role="alert" className="error-message">{sent.error}</p>}
          <button className="primary-button" disabled={sending}>
            {sending ? (mr ? "कोड पाठवत आहे…" : "Sending code…") : mr ? "कोड पाठवा" : "Send code"}
          </button>
        </form>
      ) : (
        <form action={verify} onReset={keepTyped} className="form-stack">
          <input type="hidden" name="phone" value={sent.phone} />
          <p className="notice">
            {sent.newAccount
              ? mr
                ? "हा क्रमांक तुमच्या खात्यात जोडला जाईल."
                : "This number will be added to your account."
              : mr
                ? "या क्रमांकाचे खाते सापडले. पडताळणीनंतर तुम्ही त्या खात्यात असाल आणि Google तिथे जोडले जाईल."
                : "We found an account with this number. After you verify, you’ll be in that account and Google will be connected to it."}
          </p>
          <label>
            {mr ? "पडताळणी कोड" : "Verification code"}
            <input
              name="code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              className="otp-input"
              required
            />
          </label>
          {verified.error && <p role="alert" className="error-message">{verified.error}</p>}
          <button className="primary-button" disabled={verifying}>
            {verifying ? (mr ? "पडताळत आहे…" : "Verifying…") : mr ? "पडताळा" : "Verify"}
          </button>
          <button type="button" className="text-button" onClick={onRestart}>
            {mr ? "दुसरा क्रमांक वापरा किंवा नवीन कोड पाठवा" : "Use another number or send a new code"}
          </button>
        </form>
      )}
    </section>
  );
}
