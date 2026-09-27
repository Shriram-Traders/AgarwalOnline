import { googleSignInAction } from "@/lib/auth/actions";

/** "Continue with Google" for the sign-in and sign-up pages. A plain form, so it works before JavaScript loads. */
export function GoogleButton({ mr = false }: { mr?: boolean }) {
  return (
    <form action={googleSignInAction} className="google-signin">
      <button className="google-button">
        <GoogleMark />
        {mr ? "Google ने पुढे चला" : "Continue with Google"}
      </button>
      <p className="auth-divider">
        <span>{mr ? "किंवा" : "or"}</span>
      </p>
    </form>
  );
}

/** Google's four-colour "G", which their branding rules ask sign-in buttons to show. */
export function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/** Friendly text for the `error` Better Auth appends when it sends someone back from Google. */
export function googleErrorMessage(code: string | undefined, mr = false) {
  if (!code) return null;
  if (code === "account_not_linked")
    return mr
      ? "या ईमेलचे खाते आधीच आहे आणि तुमच्या ऑर्डर तिथे सुरक्षित आहेत. त्या खात्याच्या मोबाईलवर आलेल्या कोडने एकदा साइन इन करा, मग एका टॅपमध्ये Google जोडा."
      : "You already have an account with this email, and your orders are safe in it. Sign in to it once below with a code sent to its mobile number, then connect Google in one tap.";
  if (code === "access_denied")
    return mr ? "Google साइन इन रद्द झाले." : "Google sign-in was cancelled.";
  return mr
    ? "Google साइन इन पूर्ण झाले नाही. कृपया पुन्हा प्रयत्न करा."
    : "Google sign-in didn’t complete. Please try again.";
}
