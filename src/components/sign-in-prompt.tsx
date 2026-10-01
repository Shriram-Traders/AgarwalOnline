"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, LogIn, UserPlus } from "lucide-react";
import { Modal } from "./modal";

const THEN = encodeURIComponent("/checkout");

const TEXT = {
  en: {
    eyebrow: "Almost there",
    title: "Sign in to place your order",
    body: "Your basket is saved. Sign in, or create an account in a minute, and you’ll come straight back to checkout.",
    signIn: "Sign in",
    create: "Create an account",
    button: "Sign in to checkout",
    close: "Close",
    back: "Back to basket",
  },
  mr: {
    eyebrow: "जवळजवळ झाले",
    title: "ऑर्डर देण्यासाठी साइन इन करा",
    body: "तुमची बास्केट जतन आहे. साइन इन करा किंवा एका मिनिटात खाते तयार करा — तुम्ही थेट चेकआउटवर परत याल.",
    signIn: "साइन इन",
    create: "खाते तयार करा",
    button: "चेकआउटसाठी साइन इन करा",
    close: "बंद करा",
    back: "बास्केटवर परत",
  },
};

function Choices({ mr }: { mr: boolean }) {
  const text = TEXT[mr ? "mr" : "en"];
  return (
    <div className="sign-in-choices">
      <Link href={`/login?then=${THEN}`} className="primary-button">
        <LogIn size={18} aria-hidden="true" /> {text.signIn}
      </Link>
      <Link href={`/signup?then=${THEN}`} className="secondary-button">
        <UserPlus size={18} aria-hidden="true" /> {text.create}
      </Link>
    </div>
  );
}

/** The basket's checkout button for guests: asks them to sign in or join, right where they are. */
export function SignInToCheckout({ mr = false }: { mr?: boolean }) {
  const [open, setOpen] = useState(false);
  const text = TEXT[mr ? "mr" : "en"];
  return (
    <>
      <button type="button" className="primary-button" onClick={() => setOpen(true)}>
        {text.button}
        <ArrowRight size={18} aria-hidden="true" />
      </button>
      {open && (
        <Modal eyebrow={text.eyebrow} title={text.title} onClose={() => setOpen(false)} closeLabel={text.close}>
          <p>{text.body}</p>
          <Choices mr={mr} />
        </Modal>
      )}
    </>
  );
}

/** Checkout opened without an account: the same choice pops up, and stays on the page if closed. */
export function SignInGate({ mr = false }: { mr?: boolean }) {
  const [open, setOpen] = useState(true);
  const text = TEXT[mr ? "mr" : "en"];
  return (
    <div className="panel empty-state">
      <LogIn size={40} strokeWidth={1.5} className="empty-icon" aria-hidden="true" />
      <h2>{text.title}</h2>
      <p>{text.body}</p>
      <Choices mr={mr} />
      <Link href="/cart" className="text-button">
        {text.back}
      </Link>
      {open && (
        <Modal eyebrow={text.eyebrow} title={text.title} onClose={() => setOpen(false)} closeLabel={text.close}>
          <p>{text.body}</p>
          <Choices mr={mr} />
        </Modal>
      )}
    </div>
  );
}
