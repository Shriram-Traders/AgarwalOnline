import { AuthForm } from "@/components/auth-form";
import Link from "next/link";
import { currentLocale } from "@/lib/i18n";
import { GoogleButton, googleErrorMessage } from "@/components/google-button";
import { googleEnabled } from "@/lib/auth/better-auth";
import { returnPath } from "@/lib/return-path";
import { PolicyNotice } from "@/components/policy-notice";
export const metadata = { title: "Sign in", description: "Sign in with your mobile number or email to order from Agarwal Online.", robots: { index: false } };

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; then?: string; email?: string }>;
}) {
  const locale = await currentLocale();
  const mr = locale === "mr";
  const { error, then } = await searchParams;
  // arrived from a shared-list link while signed out
  const back = returnPath(then);
  const googleError = googleErrorMessage(error, mr);
  const { email: emailResult } = await searchParams;
  // the email is already registered: sign in to that account once, then Google gets connected to it
  const existingEmail = error === "account_not_linked";
  return (
    <section className="auth-card">
      <span className="eyebrow">{mr ? "तुमचे अग्रवाल ऑनलाइन खाते" : "YOUR AGARWAL ONLINE ACCOUNT"}</span>
      <h1>{mr ? "पुन्हा स्वागत आहे." : "Good to see you."}</h1>
      <p>{mr ? "तुमचा मोबाईल क्रमांक किंवा ईमेल टाका. खाते असल्यास पासवर्ड विचारू; नसल्यास इथेच तयार करा. दुकानाचे कर्मचारीही येथूनच साइन इन करतात." : "Enter your mobile number or your email. If you have an account we’ll ask for your password; if not, you can create one right here. Store staff sign in here too."}</p>
      {googleError && (
        <p role="alert" className="error-message">
          {googleError}
        </p>
      )}
      {emailResult === "verified" && (
        <p role="status" className="success-message">
          {mr ? "ईमेल पडताळला. पुढे जाण्यासाठी साइन इन करा." : "Email confirmed. Sign in to continue."}
        </p>
      )}
      {emailResult && emailResult !== "verified" && (
        <p role="alert" className="error-message">
          {mr
            ? "ती पडताळणी लिंक चालली नाही. साइन इन करून खाते पृष्ठावरून नवीन लिंक पाठवा."
            : "That confirmation link didn’t work or has expired. Sign in and send a new one from your account page."}
        </p>
      )}
      {googleEnabled() && <GoogleButton mr={mr} />}
      <AuthForm
        locale={locale}
        initialMode={existingEmail ? "email" : "password"}
        then={existingEmail ? "connect-google" : (back ?? undefined)}
        mock={
          process.env.NODE_ENV !== "production" &&
          process.env.MOCK_OTP === "true"
        }
      />
      <PolicyNotice kind="signin" locale={locale} google={googleEnabled()} className="form-notice auth-legal" />
      <p className="auth-switch"><Link href={back ? `/signup?then=${encodeURIComponent(back)}` : "/signup"}>{mr ? "नवीन ग्राहक? खाते तयार करा →" : "New customer? Create an account →"}</Link></p>
      <p className="auth-switch"><Link href="/catalog">{mr ? "साइन इन न करता खरेदी पाहा →" : "Continue browsing without signing in →"}</Link></p>
    </section>
  );
}
