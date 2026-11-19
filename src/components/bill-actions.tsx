"use client";
import { useState } from "react";
import { Download, Eye, MessageCircle, Printer, Share2 } from "lucide-react";

type Bill = { key: string };

const query = (bill: Bill, estimate: boolean, extra: Record<string, string> = {}) => {
  const params = new URLSearchParams({
    ...(bill.key !== "agarwal" ? { bill: bill.key } : {}),
    ...(estimate ? { kind: "estimate" } : {}),
    ...extra,
  }).toString();
  return params ? `?${params}` : "";
};
/** The file name the server gives the PDF: "Agarwal-bill-20261107-00012.pdf". */
const nameFrom = (response: Response, fallback: string) =>
  /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? fallback;

const GENERIC = "Couldn’t make the PDF just now. Try again, or use Print bill and choose Save as PDF.";

/** A PDF that couldn't be made, with the words to show for it. */
class PdfProblem extends Error {}

/** Why the PDF didn't come: the server's own words when it gave a short reason, else ours. */
async function problemOf(response: Response) {
  if (response.status === 401) return "You’ve been signed out. Sign in again to get your bill.";
  const plain = (response.headers.get("Content-Type") ?? "").startsWith("text/plain");
  const said = plain ? (await response.text().catch(() => "")).trim() : "";
  if (said && said.length <= 200) return said;
  // the host's own page for a PDF that ran out of time, or a gateway's
  if (response.status >= 502) return "The PDF took too long to make. Try again in a moment, or use Print bill and choose Save as PDF.";
  return GENERIC;
}

/** One bill's PDF, as a file to save or share. */
async function fetchPdf(url: string, fallbackName: string) {
  const response = await fetch(url, { credentials: "same-origin" }).catch(() => {
    throw new PdfProblem("No connection. Check your internet and try again.");
  });
  if (!response.ok) throw new PdfProblem(await problemOf(response));
  const blob = await response.blob();
  // anything served in its place (a sign-in page, a gateway's page) is never saved as a broken PDF
  if ((await blob.slice(0, 5).text()) !== "%PDF-") throw new PdfProblem(GENERIC);
  return new File([blob], nameFrom(response, fallbackName), { type: "application/pdf" });
}

/** The words for a failure: ours, never a browser's technical message. */
const messageOf = (error: unknown) => (error instanceof PdfProblem ? error.message : GENERIC);
const named = (error: unknown, name: string) => (error as { name?: unknown } | null)?.name === name;

/**
 * Saves files to the downloads, without leaving the page. Each file's address stays alive for a few
 * minutes: Android asks "Download again?" for a bill it already has, and saves only once that is answered.
 */
function saveFiles(files: File[]) {
  for (const file of files) {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
  }
}
const savedWords = (count: number) =>
  count > 1 ? "The PDFs are in your downloads (if the browser asks, allow it to save more than one file)." : "The PDF is in your downloads.";

/** A phone or tablet, where the share list (and WhatsApp in it) is the way to send a file. */
const onPhone = () => window.matchMedia("(pointer: coarse)").matches;
/** The installed app (or a site added to the home screen), which has no tabs to open a bill in. */
const installed = () => window.matchMedia("(display-mode: standalone)").matches;

/**
 * Whether this browser can hand a PDF to another app. Android Chrome and the app, and iPhone Safari can;
 * Firefox and some apps' own browsers can't. Asked with a stand-in file, before anything is made.
 */
function canShareFiles() {
  try {
    return Boolean(navigator.canShare?.({ files: [new File(["%PDF-"], "bill.pdf", { type: "application/pdf" })] }));
  } catch {
    return false;
  }
}

/**
 * A window for WhatsApp Web, opened on the tap itself so a popup blocker lets it through once the PDF is
 * made. It says what's happening instead of standing blank; it is replaced (not followed) by WhatsApp, so
 * Back there never lands on an empty page.
 */
function waitingWindow() {
  const tab = window.open("", "_blank");
  if (!tab) return null;
  try {
    tab.document.title = "Opening WhatsApp…";
    const note = tab.document.createElement("p");
    note.textContent = "Making your PDF… WhatsApp opens here in a moment.";
    note.style.cssText = "font:16px Arial,Helvetica,sans-serif;margin:40px;color:#334155";
    tab.document.body.appendChild(note);
  } catch {
    // an empty window still works
  }
  return tab;
}

/**
 * How long a phone waits for the PDF before sending the bill's link instead. A phone opens its share list
 * only within a few seconds of the tap (about 5 in Chrome); the live server can take longer than that to
 * start making PDFs after a quiet spell, and the share was refused.
 */
const SHARE_WAIT_MS = 3500;
const wait = (ms: number) => new Promise<null>((resolve) => setTimeout(() => resolve(null), ms));

/** Opens WhatsApp in a new window on a tap: a button, so analytics never records the link's secret code. */
function openWhatsApp(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Print bill, and Share PDF on WhatsApp, for one bill or all of an order's bills. Where the browser can hand
 * a file to another app (a phone, and the Android app on Chrome) the PDFs go to the share list, where
 * WhatsApp is. On a computer a website can't hand WhatsApp a file, so the PDFs are saved and WhatsApp Web
 * opens with a view-only link to the bills: on the customer's own chat when staff send it (`phone`). A
 * phone browser that can't share files saves the PDFs too, and offers Open WhatsApp to tap.
 */
export function BillActions({
  orderId,
  orderNumber,
  bills,
  estimate = false,
  compact = false,
  printHref,
  phone,
}: {
  orderId: string;
  orderNumber: string;
  bills: Bill[];
  /** The kaccha bill (staff, before delivery). */
  estimate?: boolean;
  /** Two icon buttons, for a row in the order history. */
  compact?: boolean;
  /** With more than one bill, Print goes here to pick one (the order page's bills). */
  printHref?: string;
  /** Staff sending to the customer: their 10-digit number. */
  phone?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [whatsapp, setWhatsapp] = useState<string | null>(null);
  const [ready, setReady] = useState<File[] | null>(null);
  const what = estimate ? "kaccha bill" : bills.length > 1 ? "bills" : "bill";
  const text = estimate
    ? `Kaccha bill (estimate) for order ${orderNumber}.`
    : `${bills.length > 1 ? "Bills" : "Bill"} for order ${orderNumber}.`;

  function say(words: string, open: string | null = null) {
    setStatus(words);
    setWhatsapp(open);
  }

  function print() {
    if (bills.length > 1 && printHref) {
      window.location.href = printHref;
      return;
    }
    const url = `/api/invoices/${orderId}${query(bills[0], estimate, { view: "1", print: "1" })}`;
    // on a phone and in the app the bill opens in place, and Back comes straight back here: a second
    // window there is a separate screen, left blank when the browser holds it back
    // a full page load on purpose: the bill is served by an API route, not a page the app's router knows
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    if (onPhone() || installed()) window.location.href = url;
    else window.open(url, "_blank", "noopener");
  }

  /** The PDFs one after another: each takes the server's one browser for a moment. */
  async function makeFiles() {
    const files: File[] = [];
    for (const [index, bill] of bills.entries())
      files.push(
        await fetchPdf(
          `/api/invoices/${orderId}/pdf${query(bill, estimate)}`,
          `Bill-${orderNumber}${bills.length > 1 ? `-${index + 1}` : ""}.pdf`,
        ),
      );
    return files;
  }

  /** The bill's view-only link (/b/<code>), or "" when it couldn't be had (signed out, no connection). */
  async function billLink() {
    const response = await fetch(`/api/invoices/${orderId}/link`, { method: "POST", credentials: "same-origin" }).catch(() => null);
    return (response?.ok ? ((await response.json().catch(() => ({}))) as { url?: string }).url : undefined) ?? "";
  }
  const whatsappUrl = (link: string) =>
    `https://wa.me/${phone && /^\d{10}$/.test(phone) ? `91${phone}` : ""}?text=${encodeURIComponent(`${text}${link ? ` ${link}` : ""}`)}`;

  /** WhatsApp with the view-only link: in the window opened on the tap, or on a second tap. `before` says what came first. */
  function openLink(link: string, tab: Window | null, before: string) {
    const url = whatsappUrl(link);
    if (tab && !tab.closed) {
      tab.opener = null;
      tab.location.replace(url);
      say(`${before} WhatsApp opens with a link to the ${what}.`);
    } else {
      // a window opened now, after the wait, would be blocked
      say(`${before} Tap Open WhatsApp to send a link to the ${what}.`, url);
    }
  }

  /** The PDFs saved, then WhatsApp with the view-only link. */
  async function saveAndLink(files: File[], tab: Window | null, link: Promise<string>) {
    saveFiles(files);
    openLink(await link, tab, savedWords(files.length));
  }

  /** The share list with the bill's link, for when the PDF was too slow for it or couldn't be made. */
  async function shareLink(link: string, problem: string) {
    if (!link) return say(problem);
    try {
      await navigator.share({ text: `${text} ${link}` });
      say(`Shared a link to the ${what}: whoever opens it can download the PDF.`);
    } catch (error) {
      if (named(error, "AbortError")) say("");
      else say(`Tap Open WhatsApp to send a link to the ${what}.`, whatsappUrl(link));
    }
  }

  /** Hands the PDFs to the share list; false when the browser wouldn't, after the files were made. */
  async function shareFiles(files: File[]) {
    try {
      await navigator.share({ files, text });
      setReady(null);
      say("");
    } catch (error) {
      // closed without picking an app: nothing to say
      if (named(error, "AbortError")) say("");
      // making the PDF took longer than the browser lets a share wait: the next tap shares it
      else if (named(error, "NotAllowedError") && !ready) {
        setReady(files);
        say("Your PDF is ready. Tap Share PDF on WhatsApp again to send it.");
      } else {
        setReady(null);
        await saveAndLink(files, null, billLink());
      }
    }
  }

  async function share() {
    if (ready) {
      await shareFiles(ready);
      return;
    }
    const native = onPhone() && canShareFiles();
    const tab = onPhone() ? null : waitingWindow();
    setBusy(true);
    say(`Making the ${what} PDF…`);
    // the link is asked for at once, alongside the PDF: it's what WhatsApp gets if the PDF can't come
    const link = billLink();
    let problem = GENERIC;
    const made = makeFiles().catch((error: unknown) => {
      problem = messageOf(error);
      return null;
    });
    try {
      if (native) {
        // a PDF slower than the share list waits for, or none at all: the link goes while the tap still counts
        const files = await Promise.race([made, wait(SHARE_WAIT_MS)]);
        if (files) await shareFiles(files);
        else await shareLink(await link, problem);
        return;
      }
      const files = await made;
      if (files) return await saveAndLink(files, tab, link);
      const url = await link;
      if (url) return openLink(url, tab, problem);
      tab?.close();
      say(problem);
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    setBusy(true);
    say(`Making the ${what} PDF…`);
    try {
      const files = await makeFiles();
      saveFiles(files);
      say(savedWords(files.length));
    } catch (error) {
      say(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  // compact (a history row): a short word shows, and the full name is what's read out and matched by voice
  const label = (full: string, short: string) =>
    compact ? (
      <>
        <span className="sr-only">{full}</span>
        <span aria-hidden="true">{short}</span>
      </>
    ) : (
      <span>{full}</span>
    );

  return (
    <div className={compact ? "bill-actions is-compact" : "bill-actions"}>
      <button type="button" className="secondary-button bill-print" onClick={print} title={compact ? `Print ${what}` : undefined}>
        <Printer size={17} aria-hidden="true" />
        {label(estimate ? "Print kaccha bill" : bills.length > 1 ? "Print bills" : "Print bill", "Print")}
      </button>
      <button
        type="button"
        className="bill-share"
        onClick={share}
        disabled={busy}
        aria-busy={busy}
        title={compact ? `Share ${what} PDF on WhatsApp` : undefined}
      >
        <Share2 size={17} aria-hidden="true" />
        {label(estimate ? "Share kaccha bill" : "Share PDF on WhatsApp", "Share PDF")}
      </button>
      {!compact && (
        <button type="button" className="text-button bill-download" onClick={download} disabled={busy}>
          <Download size={15} aria-hidden="true" /> Download PDF
        </button>
      )}
      <span className="bill-actions-status" aria-live="polite">
        {status}
      </span>
      {whatsapp && (
        <button type="button" className="bill-share bill-whatsapp" onClick={() => openWhatsApp(whatsapp)}>
          <MessageCircle size={17} aria-hidden="true" /> Open WhatsApp
        </button>
      )}
    </div>
  );
}

/**
 * A bill's buttons on its view-only link (/b/<code>), for whoever it was sent to: Download PDF saves it
 * without leaving the page, and says what went wrong if it can't; View bill opens it in place, with Back.
 */
export function SharedBillActions({ pdfUrl, viewUrl, fileName }: { pdfUrl: string; viewUrl: string; fileName: string }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function download() {
    setBusy(true);
    setStatus("Making the PDF…");
    try {
      saveFiles([await fetchPdf(pdfUrl, fileName)]);
      setStatus(savedWords(1));
    } catch (error) {
      setStatus(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="bill-actions">
      <button type="button" className="primary-button" onClick={download} disabled={busy} aria-busy={busy}>
        <Download size={17} aria-hidden="true" /> Download PDF
      </button>
      <a className="secondary-button" href={viewUrl}>
        <Eye size={17} aria-hidden="true" /> View bill
      </a>
      <span className="bill-actions-status" aria-live="polite">
        {status}
      </span>
    </span>
  );
}
