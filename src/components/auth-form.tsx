"use client";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { PasswordInput } from "@/components/password-input";
import { PhoneInput, codeDigits } from "@/components/phone-input";
import { keepTyped } from "@/components/action-form";
import { safeAction } from "@/components/safe-action";
import { LegalText } from "@/components/legal-text";
import { tenDigitMobile } from "@/lib/auth/otp";
import {
  customerEmailLoginAction,
  customerPasswordLoginAction,
  identifyAction,
  sendOTPAction,
  verifyOTPAction,
  type AuthState,
} from "@/lib/auth/actions";

const check = safeAction(identifyAction);
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
const wholeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
const wholeMobile = (value: string) => /^[6-9]\d{9}$/.test(value);

type Props = {
  mock?: boolean;
  locale?: "en" | "mr";
  initialMode?: "password" | "email" | "signup";
  /** "connect-google": land on the account page ready to connect Google; a `/lists/…` path: go back to that shared list. */
  then?: string;
};

/**
 * Sign in and sign up in one: a mobile number or an email address first. An account with a password
 * goes on to the password; a new one (or one with no password yet) to a 6-digit code, sent to that
 * number on WhatsApp/SMS or to that email, which creates the account or sets its password. Only one
 * of the two is ever needed.
 */
export function AuthForm(props: Props) {
  // "Use another number" starts again from an empty first box
  const [round, setRound] = useState(0);
  return <AuthSteps key={round} {...props} restart={() => setRound((value) => value + 1)} />;
}

function AuthSteps({ mock = false, locale = "en", initialMode = "password", then, restart }: Props & { restart: () => void }) {
  const mr = locale === "mr";
  const [by, setBy] = useState<"phone" | "email">(initialMode === "email" ? "email" : "phone");
  const [typed, setTyped] = useState("");
  const [found, identify, identifying] = useActionState(check, {});
  const [sent, send, sending] = useActionState(sendOrResend, {});
  const [verified, verify, verifying] = useActionState(verifyCode, {});
  const [customerSigned, customerSign, customerSigning] = useActionState(passwordSignIn, {});
  const [emailSigned, emailSign, emailSigning] = useActionState(emailSignIn, {});
  const formRef = useRef<HTMLFormElement>(null);
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

  // what the first box holds, the way the server will read it
  const id = by === "email" ? typed.trim().toLowerCase() : typed;
  const whole = by === "email" ? wholeEmail(id) : wholeMobile(id);
  // the answer counts only for what is in the box now: change a digit and it is asked again
  const answer = found.by === by && (by === "email" ? found.email : found.phone) === id ? found : null;
  const step = answer?.step;
  // asked as soon as the box holds a whole number, or a moment after a whole email stops changing
  const asked = useRef("");
  useEffect(() => {
    const key = `${by}:${id}`;
    if (!whole || asked.current === key) return;
    const timer = window.setTimeout(
      () => {
        asked.current = key;
        const form = formRef.current;
        if (form) startTransition(() => identify(new FormData(form)));
      },
      by === "phone" ? 0 : 600,
    );
    return () => window.clearTimeout(timer);
  }, [by, id, whole, identify]);

  const signIn = by === "phone" ? customerSign : emailSign;
  const signing = by === "phone" ? customerSigning : emailSigning;
  const signError = by === "phone" ? customerSigned.error : emailSigned.error;
  const where = by === "phone" ? (mr ? "हा क्रमांक" : "this number") : (mr ? "हा ईमेल" : "this email");

  if (sent.challengeId)
    return (
      <form action={verify} onReset={keepTyped} className="form-stack">
        {then && <input type="hidden" name="then" value={then} />}
        <div className="auth-step-heading">
          <span className="status-pill">{sent.newAccount ? (mr ? "नवीन खाते" : "NEW ACCOUNT") : (mr ? "नवीन पासवर्ड" : "NEW PASSWORD")}</span>
          <p>
            {sent.by === "email"
              ? mr
                ? `${sent.email} वर ईमेलने पाठवलेला कोड टाका.`
                : `Enter the code we emailed to ${sent.email}.`
              : mr
                ? `+91 ••••••${sent.phone?.slice(-4)} वर पाठवलेला कोड टाका.`
                : `Enter the code sent to +91 ••••••${sent.phone?.slice(-4)}.`}
          </p>
        </div>
        <input type="hidden" name="by" value={sent.by ?? "phone"} />
        {sent.by === "email" ? (
          <input type="hidden" name="email" value={sent.email} />
        ) : (
          <input type="hidden" name="phone" value={sent.phone} />
        )}
        <input type="hidden" name="challengeId" value={sent.challengeId} />
        <input type="hidden" name="intent" value={sent.newAccount ? "signup" : "reset"} />
        {sent.newAccount && (
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
        )}
        {/* a new account and a forgotten password both end with a password: the code never signs in on its own */}
        <label>
          {sent.newAccount ? (mr ? "पासवर्ड तयार करा" : "Create password") : (mr ? "नवीन पासवर्ड" : "New password")}
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
        <label>
          {mr ? "पडताळणी कोड" : "Verification code"}
          <input
            name="code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            autoComplete="one-time-code"
            enterKeyHint="done"
            onInput={codeDigits}
            className="otp-input"
            aria-describedby="otp-help"
            required
          />
        </label>
        <small className="muted" id="otp-help">
          {sent.by === "email"
            ? mr
              ? "Agarwal Online कडून आलेल्या ईमेलमधील सहा अंक टाका (Spam मध्येही पाहा). कोड १० मिनिटे चालतो."
              : "The email comes from Agarwal Online (look in Spam too). Enter its six digits; the code works for 10 minutes."
            : mr
              ? "MiniMoth कडून आलेल्या WhatsApp किंवा SMS मधील सहा अंक टाका."
              : "Your code arrives on WhatsApp (or SMS) from MiniMoth. Enter its six digits."}
        </small>
        {sent.newAccount && (
          <p className="muted">
            <LegalText
              newTab
              mr={mr}
              text={
                mr
                  ? "पडताळणीनंतर तुमचे खाते तयार होईल. पुढे जाऊन तुम्ही आमच्या [अटी व शर्ती](/p/terms-and-conditions) आणि [गोपनीयता धोरण](/p/privacy-policy) ला संमती देता."
                  : "Verifying creates your account. By continuing you agree to our [Terms & Conditions](/p/terms-and-conditions) and [Privacy Policy](/p/privacy-policy)."
              }
            />
          </p>
        )}
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
          {verifying ? (mr ? "पडताळत आहे…" : "Verifying…") : sent.newAccount ? (mr ? "पडताळा आणि पुढे जा" : "Verify & continue") : (mr ? "पासवर्ड बदला आणि साइन इन करा" : "Save password & sign in")}
        </button>
        <div className="split-actions">
          <button type="button" className="secondary-button" onClick={restart}>
            {sent.by === "email" ? (mr ? "दुसरा ईमेल वापरा" : "Use another email") : (mr ? "दुसरा क्रमांक वापरा" : "Use another number")}
          </button>
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
    );

  return (
    <>
      {/* one box, a mobile number or an email: whichever the person has */}
      <div className="auth-mode-tabs" role="group" aria-label={mr ? "साइन इन पद्धत" : "Sign in with"}>
        {(["phone", "email"] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            className={by === kind ? "active" : ""}
            aria-pressed={by === kind}
            onClick={() => {
              setBy(kind);
              setTyped("");
            }}
          >
            {kind === "phone" ? (mr ? "मोबाईल" : "Mobile") : mr ? "ईमेल" : "Email"}
          </button>
        ))}
      </div>
      {mock && (
        <p className="notice">
          {mr ? "डेव्हलपमेंट OTP मोड सुरू आहे. स्थानिक सेटिंगमधील कोड वापरा." : "Development OTP mode is enabled. Use the code configured in your local environment."}
        </p>
      )}
      <form ref={formRef} action={step === "password" ? signIn : identify} onReset={keepTyped} className="form-stack">
        {then && <input type="hidden" name="then" value={then} />}
        <input type="hidden" name="by" value={by} />
        {/* what a code is for, for Forgot password and Start account creation (React drops name and value
            on a button with its own formAction, so the reason rides here) */}
        {step && <input type="hidden" name="intent" value={step === "new" ? "signup" : "reset"} />}
        {by === "phone" ? (
          <label>
            {mr ? "मोबाईल क्रमांक" : "Mobile number"}
            <div className="phone-input">
              <span>+91</span>
              <PhoneInput
                key="phone"
                autoComplete="username"
                placeholder={mr ? "१० अंकी मोबाईल क्रमांक" : "10-digit mobile number"}
                onChange={(event) => setTyped(tenDigitMobile(event.currentTarget.value))}
                required
              />
            </div>
          </label>
        ) : (
          <label>
            {mr ? "ईमेल पत्ता" : "Email address"}
            <input
              key="email"
              name="email"
              type="email"
              autoComplete="username"
              placeholder="name@example.com"
              onChange={(event) => setTyped(event.currentTarget.value)}
              required
            />
          </label>
        )}
        {found.error && (answer || !found.by) && (
          <p role="alert" className="error-message">
            {found.error}
          </p>
        )}

        {step === "password" ? (
          <>
            <label>
              {mr ? "पासवर्ड" : "Password"}
              <PasswordInput name="password" autoComplete="current-password" minLength={8} mr={mr} />
            </label>
            {signError && <p role="alert" className="error-message">{signError}</p>}
            {sent.error && <p role="alert" className="error-message">{sent.error}</p>}
            <button className="primary-button" disabled={signing}>
              {signing
                ? mr
                  ? "साइन इन होत आहे…"
                  : "Signing in…"
                : by === "phone"
                  ? mr
                    ? "साइन इन करा"
                    : "Sign in"
                  : mr
                    ? "ईमेलने साइन इन करा"
                    : "Sign in with email"}
            </button>
            {/* a code to set a new password, sent to the same number or email */}
            <button
              className="text-button auth-alternate"
              type="submit"
              formAction={send}
              formNoValidate
              disabled={sending}
            >
              {sending ? (mr ? "कोड पाठवत आहे…" : "Sending code…") : mr ? "पासवर्ड विसरलात?" : "Forgot your password?"}
            </button>
          </>
        ) : step === "new" || step === "set" ? (
          <>
            <div className="auth-step-heading">
              <span className="status-pill">{step === "new" ? (mr ? "नवीन खाते" : "NEW ACCOUNT") : (mr ? "पासवर्ड नाही" : "NO PASSWORD YET")}</span>
              <p>
                {step === "new"
                  ? mr
                    ? `${where} वर अजून खाते नाही. खाते तयार करण्यासाठी आम्ही ६ अंकी कोड पाठवू.`
                    : `There’s no account with ${where} yet. We’ll send a 6-digit code to create one.`
                  : mr
                    ? `या खात्याला अजून पासवर्ड नाही. पासवर्ड ठेवण्यासाठी आम्ही ${where} वर कोड पाठवू.`
                    : `This account has no password yet. We’ll send a code to ${where} to set one.`}
              </p>
            </div>
            {sent.error && (
              <p role="alert" className="error-message">
                {sent.error}
              </p>
            )}
            <button
              className="primary-button"
              type="submit"
              formAction={send}
              disabled={sending}
            >
              {sending
                ? mr
                  ? "कोड पाठवत आहे…"
                  : "Sending code…"
                : step === "new"
                  ? mr
                    ? "खाते तयार करणे सुरू करा"
                    : "Start account creation"
                  : mr
                    ? "कोड पाठवा"
                    : "Send code"}
            </button>
            <p className="muted">
              {by === "email"
                ? mr
                  ? "कोड Agarwal Online कडून ईमेलने येईल."
                  : "The code comes by email from Agarwal Online."
                : mr
                  ? "कोड WhatsApp वर (किंवा SMS ने) MiniMoth कडून येईल. तुमचा क्रमांक गोपनीय राहतो."
                  : "The code comes on WhatsApp (or SMS) from MiniMoth. Your number stays private."}
            </p>
          </>
        ) : (
          <button className="primary-button" disabled={identifying}>
            {identifying ? (mr ? "तपासत आहे…" : "Checking…") : mr ? "पुढे जा" : "Continue"}
          </button>
        )}
      </form>
    </>
  );
}
