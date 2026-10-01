"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { PasswordInput } from "@/components/password-input";
import { keepTyped } from "@/components/action-form";
import { safeAction } from "@/components/safe-action";
import {
  customerEmailLoginAction,
  customerPasswordLoginAction,
  sendOTPAction,
  verifyOTPAction,
  type AuthState,
} from "@/lib/auth/actions";

const sendCode = safeAction(sendOTPAction);
const verifyCode = safeAction(verifyOTPAction);
const passwordSignIn = safeAction(customerPasswordLoginAction);
const emailSignIn = safeAction(customerEmailLoginAction);
/**
 * Sending the first code moves on to the code step; resending stays there. A failed resend
 * shows its error on the code step instead of throwing away the code the customer already has.
 */
type SendState = AuthState & { resent?: boolean };
async function sendOrResend(state: SendState, form: FormData): Promise<SendState> {
  const next = await sendCode(state, form);
  if (!state.challengeId) return next;
  return next.error ? { ...state, error: next.error, resent: false } : { ...next, resent: true };
}
export function AuthForm({
  mock = false,
  locale = "en",
  initialMode = "password",
  then,
}: {
  mock?: boolean;
  locale?: "en" | "mr";
  initialMode?: "password" | "signup" | "otp";
  /** "connect-google": land on the account page ready to connect Google; a `/lists/…` path: go back to that shared list. */
  then?: string;
}) {
  const mr = locale === "mr";
  const [sent, send, sending] = useActionState(sendOrResend, {});
  const [verified, verify, verifying] = useActionState(verifyCode, {});
  const [customerSigned, customerSign, customerSigning] = useActionState(passwordSignIn, {});
  const [emailSigned, emailSign, emailSigning] = useActionState(emailSignIn, {});
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const confirmRef = useRef<HTMLInputElement>(null);
  const mismatch = confirm.length > 0 && password !== confirm;
  // native validation blocks submit, so a mismatch never costs a round trip
  useEffect(() => {
    confirmRef.current?.setCustomValidity(
      mismatch ? (mr ? "पासवर्ड जुळत नाहीत." : "Passwords do not match.") : "",
    );
  }, [mismatch, mr]);
  const [mode, setMode] = useState<"password" | "email" | "signup" | "otp">(
    initialMode,
  );
  const [resendIn, setResendIn] = useState(30);
  const wasSending = useRef(false);
  useEffect(() => {
    if (!sent.challengeId || resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [sent.challengeId, resendIn]);
  useEffect(() => {
    if (wasSending.current && !sending && sent.challengeId) setResendIn(30);
    wasSending.current = sending;
  }, [sending, sent.challengeId]);
  return (
    <>
      {/* two ways to sign in; creating an account is a separate journey, linked below the form */}
      {!sent.challengeId && mode !== "signup" && (
        <div className="auth-mode-tabs" role="group" aria-label={mr ? "साइन इन पद्धत" : "Sign in with"}>
          <button
            type="button"
            className={mode === "password" || mode === "otp" ? "active" : ""}
            aria-pressed={mode === "password" || mode === "otp"}
            onClick={() => setMode("password")}
          >
            {mr ? "मोबाईल" : "Mobile"}
          </button>
          <button
            type="button"
            className={mode === "email" ? "active" : ""}
            aria-pressed={mode === "email"}
            onClick={() => setMode("email")}
          >
            {mr ? "ईमेल" : "Email"}
          </button>
        </div>
      )}
      {mock && (
        <p className="notice">
          {mr ? "डेव्हलपमेंट OTP मोड सुरू आहे. स्थानिक सेटिंगमधील कोड वापरा." : "Development OTP mode is enabled. Use the code configured in your local environment."}
        </p>
      )}
      {!sent.challengeId && mode === "password" ? (
        <form action={customerSign} onReset={keepTyped} className="form-stack">
          {then && <input type="hidden" name="then" value={then} />}
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
                autoComplete="username"
                defaultValue={customerSigned.phone}
                placeholder={mr ? "१० अंकी मोबाईल क्रमांक" : "10-digit mobile number"}
                required
              />
            </div>
          </label>
          <label>
            {mr ? "पासवर्ड" : "Password"}
            <PasswordInput
              name="password"
              autoComplete="current-password"
              minLength={8}
              mr={mr}
            />
          </label>
          {customerSigned.error && <p role="alert" className="error-message">{customerSigned.error}</p>}
          <button className="primary-button" disabled={customerSigning}>
            {customerSigning ? (mr ? "साइन इन होत आहे…" : "Signing in…") : (mr ? "साइन इन करा" : "Sign in")}
          </button>
          <button className="text-button auth-alternate" type="button" onClick={() => setMode("otp")}>
            {mr ? "पासवर्ड विसरलात किंवा सेट केलेला नाही? OTP वापरा" : "Forgot or haven’t set a password? Use OTP"}
          </button>
        </form>
      ) : !sent.challengeId && mode === "email" ? (
        <form action={emailSign} onReset={keepTyped} className="form-stack">
          {then && <input type="hidden" name="then" value={then} />}
          <label>
            {mr ? "ईमेल पत्ता" : "Email address"}
            <input
              name="email"
              type="email"
              autoComplete="username"
              defaultValue={emailSigned.email}
              placeholder="name@example.com"
              required
            />
          </label>
          <label>
            {mr ? "पासवर्ड" : "Password"}
            <PasswordInput
              name="password"
              autoComplete="current-password"
              minLength={8}
              mr={mr}
            />
          </label>
          {emailSigned.error && <p role="alert" className="error-message">{emailSigned.error}</p>}
          <button className="primary-button" disabled={emailSigning}>
            {emailSigning ? (mr ? "साइन इन होत आहे…" : "Signing in…") : (mr ? "ईमेलने साइन इन करा" : "Sign in with email")}
          </button>
          <button className="text-button auth-alternate" type="button" onClick={() => setMode("otp")}>
            {mr ? "त्याऐवजी मोबाईल OTP वापरा" : "Use mobile OTP instead"}
          </button>
        </form>
      ) : !sent.challengeId ? (
        <form action={send} onReset={keepTyped} className="form-stack">
          <input type="hidden" name="intent" value={mode === "signup" ? "signup" : "signin"} />
          {mode === "signup" && (
            <label>
              {mr ? "ईमेल पत्ता" : "Email address"}
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="name@example.com"
                required
              />
            </label>
          )}
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
                placeholder={mr ? "१० अंकी मोबाईल क्रमांक" : "10-digit mobile number"}
                required
              />
            </div>
          </label>
          {sent.error && (
            <p role="alert" className="error-message">
              {sent.error}
            </p>
          )}
          <button className="primary-button" disabled={sending}>
            {sending ? (mr ? "कोड पाठवत आहे…" : "Sending code…") : mode === "signup" ? (mr ? "खाते तयार करणे सुरू करा" : "Start account creation") : (mr ? "OTP ने साइन इन करा" : "Sign in with OTP")}
          </button>
          <p className="muted">
            {mr ? "आम्ही ६ अंकी कोड पाठवू. तुमचा क्रमांक गोपनीय राहतो." : "We’ll send a 6-digit code. Your number stays private."}
          </p>
        </form>
      ) : (
        <form action={verify} onReset={keepTyped} className="form-stack">
          {then && <input type="hidden" name="then" value={then} />}
          <div className="auth-step-heading">
            <span className="status-pill">{sent.newAccount ? (mr ? "नवीन खाते" : "NEW ACCOUNT") : (mr ? "पुन्हा स्वागत" : "WELCOME BACK")}</span>
            <p>{mr ? "+91 ••••••" : "Enter the code sent to +91 ••••••"}{sent.phone?.slice(-4)}{mr ? " वर पाठवलेला कोड टाका." : "."}</p>
          </div>
          <input type="hidden" name="phone" value={sent.phone} />
          <input type="hidden" name="challengeId" value={sent.challengeId} />
          <input type="hidden" name="intent" value={sent.newAccount ? "signup" : "signin"} />
          {sent.email && <input type="hidden" name="email" value={sent.email} />}
          {sent.newAccount && (
            <>
              <label>
                {mr ? "तुमचे नाव" : "Your name"}
                <input
                  name="name"
                  type="text"
                  minLength={2}
                  maxLength={80}
                  autoComplete="name"
                  placeholder={mr ? "ऑर्डरसाठी वापरले जाणारे नाव" : "Name used for orders"}
                  required
                />
              </label>
              <label>
                {mr ? "पासवर्ड तयार करा" : "Create password"}
                <PasswordInput
                  name="password"
                  autoComplete="new-password"
                  minLength={8}
                  mr={mr}
                  describedBy="password-help"
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <small className="muted" id="password-help">{mr ? "किमान ८ अक्षरे वापरा." : "Use at least 8 characters."}</small>
              <label>
                {mr ? "पासवर्डची खात्री करा" : "Confirm password"}
                <PasswordInput
                  name="confirmPassword"
                  autoComplete="new-password"
                  minLength={8}
                  mr={mr}
                  inputRef={confirmRef}
                  invalid={mismatch}
                  onChange={(event) => setConfirm(event.target.value)}
                />
              </label>
              {mismatch && (
                <small role="alert" className="error-message">
                  {mr ? "पासवर्ड जुळत नाहीत." : "Passwords do not match."}
                </small>
              )}
            </>
          )}
          <label>
            {mr ? "पडताळणी कोड" : "Verification code"}
            <input
              name="code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              enterKeyHint="done"
              className="otp-input"
              aria-describedby="otp-help"
              required
            />
          </label>
          <small className="muted" id="otp-help">{mr ? "SMS मधील सहा अंक टाका." : "Enter the six digits shown in your SMS."}</small>
          {sent.newAccount && <p className="muted">{mr ? "पडताळणीनंतर तुमचे खाते तयार होईल आणि दुकानाच्या गोपनीयता अटी लागू होतील." : "Verification creates your account and accepts the store’s privacy terms."}</p>}
          {verified.error && (
            <p role="alert" className="error-message">
              {verified.error}
            </p>
          )}
          {sent.error && (
            <p role="alert" className="error-message">
              {sent.error}
            </p>
          )}
          {sent.resent && !sent.error && !sending && (
            <p role="status" className="success-message">
              {mr ? "नवीन कोड पाठवला." : "New code sent."}
            </p>
          )}
          <button className="primary-button" disabled={verifying}>
            {verifying ? (mr ? "पडताळत आहे…" : "Verifying…") : (mr ? "पडताळा आणि पुढे जा" : "Verify & continue")}
          </button>
          <div className="split-actions">
            <a className="secondary-button" href={sent.newAccount ? "/signup" : "/login"}>{mr ? "दुसरा क्रमांक वापरा" : "Use another number"}</a>
            {/* formNoValidate: asking for a new code must not wait for the code box (or name and password) to be filled */}
            <button
              className="secondary-button"
              type="submit"
              formAction={send}
              formNoValidate
              disabled={sending || resendIn > 0}
            >
              {resendIn > 0 ? (mr ? `${resendIn} सेकंदांनी पुन्हा पाठवा` : `Resend in ${resendIn}s`) : (mr ? "कोड पुन्हा पाठवा" : "Resend code")}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
