import { AuthForm } from "@/components/auth-form";
import { returnPath } from "@/lib/return-path";
import Link from "next/link";
import { currentLocale } from "@/lib/i18n";
import { GoogleButton, googleErrorMessage } from "@/components/google-button";
import { googleEnabled } from "@/lib/auth/better-auth";
export const metadata = { title: "Create an account", description: "Create an Agarwal General Stores account with your mobile number." };

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
      <span className="eyebrow">{mr ? "नवीन अग्रवाल खाते" : "NEW AGARWAL ACCOUNT"}</span>
      <h1>{mr ? "चला, खाते तयार करूया." : "Let’s create your account."}</h1>
      <p>{mr ? "मोबाईल एकदा पडताळा, ईमेल जोडा आणि पुढील वेळेसाठी सुरक्षित पासवर्ड तयार करा." : "Verify your mobile once, add your email, and create a secure password for faster sign-in."}</p>
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
      <p className="auth-switch"><Link href={back ? `/login?then=${encodeURIComponent(back)}` : "/login"}>{mr ? "आधीच खाते आहे? साइन इन करा →" : "Already have an account? Sign in →"}</Link></p>
    </section>
  );
}
