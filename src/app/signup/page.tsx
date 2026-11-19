import { AuthForm } from "@/components/auth-form";
import { returnPath } from "@/lib/return-path";
import Link from "next/link";
import { currentLocale } from "@/lib/i18n";
import { GoogleButton, googleErrorMessage } from "@/components/google-button";
import { googleEnabled } from "@/lib/auth/better-auth";
import { PolicyNotice } from "@/components/policy-notice";
export const metadata = { title: "Create an account", description: "Create an Agarwal Online account with your mobile number or your email.", robots: { index: false } };

export default async function Signup({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; then?: string }>;
}) {
  const locale = await currentLocale();
  const mr = locale === "mr";
  const query = await searchParams;
  const googleError = googleErrorMessage(query.error, mr);
  const back = returnPath(query.then);
  return (
    <section className="auth-card">
      <span className="eyebrow">{mr ? "नवीन अग्रवाल ऑनलाइन खाते" : "NEW AGARWAL ONLINE ACCOUNT"}</span>
      <h1>{mr ? "चला, खाते तयार करूया." : "Let’s create your account."}</h1>
      <p>{mr ? "मोबाईल क्रमांक किंवा ईमेल, जे तुमच्याकडे आहे ते वापरा. त्यावर कोड पाठवून खाते तयार करू, मग पुढील वेळेसाठी पासवर्ड ठेवा." : "Use your mobile number or your email, whichever you have. We’ll send a code to it to create your account, then you choose a password for next time."}</p>
      {googleError && (
        <p role="alert" className="error-message">
          {googleError}
        </p>
      )}
      {googleEnabled() && <GoogleButton mr={mr} />}
      <AuthForm
        locale={locale}
        initialMode="signup"
        then={back ?? undefined}
        mock={process.env.NODE_ENV !== "production" && process.env.MOCK_OTP === "true"}
      />
      <PolicyNotice kind="signup" locale={locale} google={googleEnabled()} className="form-notice auth-legal" />
      <p className="auth-switch"><Link href={back ? `/login?then=${encodeURIComponent(back)}` : "/login"}>{mr ? "आधीच खाते आहे? साइन इन करा →" : "Already have an account? Sign in →"}</Link></p>
    </section>
  );
}
