/**
 * The buttons at the top of a bill page: Print bill, Share PDF on WhatsApp and a small Download PDF, with
 * Back when the page was opened in place. They are never printed, and the PDF is made from the page without them.
 */
export type BillBar = {
  /** Without it, only Print bill shows (a sample bill has no PDF to share). */
  share?: {
    /** The bill as a PDF (`/api/invoices/<id>/pdf?…`). */
    pdfUrl: string;
    fileName: string;
    /** The WhatsApp message: "Bill … for order … from …". */
    text: string;
    /** The view-only bill link, when it is already known (on a /b/<code> page). */
    link?: string;
    /** Where to ask for that link otherwise (POST `/api/invoices/<id>/link`). */
    linkUrl?: string;
    /** Staff sending to the customer: their number as 91XXXXXXXXXX, so WhatsApp opens on their chat. */
    phone?: string;
  } | null;
  /** Opened from a Print button elsewhere: print as soon as the page has loaded. */
  autoPrint?: boolean;
};

/*
 * Share where the browser can hand a file to another app (a phone, the Android app on Chrome, iPhone
 * Safari): the PDF goes to the share list, where WhatsApp is. The share list only opens within a few
 * seconds of the tap, so a PDF not ready in 3.5 seconds (the live server starting up after a quiet spell)
 * sends the bill's view-only link there instead. On a computer a website can't hand WhatsApp a file, so the
 * PDF is saved and WhatsApp Web opens with a view-only link to the bill: in a window opened on the tap
 * itself (so a popup blocker doesn't stop it) that says what's happening and is replaced by WhatsApp, so
 * Back never lands on a blank page. A phone browser that can't share files saves the PDF and offers Open
 * WhatsApp to tap. A PDF that can't be made still sends the link, after the server's reason ("Too many
 * PDFs…"). Download saves the PDF without leaving the page, and says why when it can't.
 * Back shows when the bill was opened in place from the shop (Print bill on a phone, View bill on a link).
 */
const SCRIPT = `(function(){var cfg=window.__billShare,auto=window.__billAutoPrint;if(auto)window.addEventListener("load",function(){setTimeout(function(){window.print()},300)});var back=document.getElementById("bb-back");if(back){var fromShop=false;try{fromShop=history.length>1&&!!document.referrer&&new URL(document.referrer).origin===location.origin}catch(e){}if(fromShop){back.hidden=false;back.addEventListener("click",function(){history.back()})}}if(!cfg)return;var shareBtn=document.getElementById("bb-share"),downBtn=document.getElementById("bb-download"),status=document.getElementById("bb-status"),ready=null;var GENERIC="Couldn’t make the PDF just now. Try again, or tap Print bill and choose Save as PDF.";function say(words,open){status.textContent=words;if(open){var a=document.createElement("a");a.className="bb-wa";a.href=open;a.target="_blank";a.rel="noopener noreferrer";a.textContent="Open WhatsApp";status.appendChild(a)}}function busy(on){shareBtn.disabled=on;downBtn.disabled=on}function problem(words){var e=new Error(words);e.shown=true;return e}function why(r){if(r.status===401)return Promise.resolve("You’ve been signed out. Sign in again to get your bill.");var plain=(r.headers.get("Content-Type")||"").indexOf("text/plain")===0;return(plain?r.text():Promise.resolve("")).then(function(t){t=(t||"").trim();if(t&&t.length<=200)return t;return r.status>=502?"The PDF took too long to make. Try again in a moment, or tap Print bill and choose Save as PDF.":GENERIC},function(){return GENERIC})}function pdf(){return fetch(cfg.pdfUrl,{credentials:"same-origin"}).then(function(r){if(!r.ok)return why(r).then(function(words){throw problem(words)});return r.blob().then(function(blob){return blob.slice(0,5).text().then(function(head){if(head!=="%PDF-")throw problem(GENERIC);return new File([blob],cfg.fileName,{type:"application/pdf"})})})},function(){throw problem("No connection. Check your internet and try again.")})}function save(file){var url=URL.createObjectURL(file),a=document.createElement("a");a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url)},300000)}function canShareFiles(){try{return!!(navigator.canShare&&navigator.canShare({files:[new File(["%PDF-"],"bill.pdf",{type:"application/pdf"})]}))}catch(e){return false}}function link(){if(cfg.link)return Promise.resolve(cfg.link);if(!cfg.linkUrl)return Promise.resolve("");return fetch(cfg.linkUrl,{method:"POST",credentials:"same-origin"}).then(function(r){return r.ok?r.json():{}}).then(function(d){return(d&&d.url)||""},function(){return""})}function waiting(){var w=window.open("","_blank");if(!w)return null;try{w.document.title="Opening WhatsApp…";var p=w.document.createElement("p");p.textContent="Making your PDF… WhatsApp opens here in a moment.";p.style.cssText="font:16px Arial,Helvetica,sans-serif;margin:40px;color:#334155";w.document.body.appendChild(p)}catch(e){}return w}function wa(url){return"https://wa.me/"+(cfg.phone||"")+"?text="+encodeURIComponent(cfg.text+(url?" "+url:""))}function openWa(url,win,before){var w=wa(url);if(win&&!win.closed){try{win.opener=null}catch(e){}win.location.replace(w);say(before+" WhatsApp opens with a link to the bill.")}else say(before+" Tap Open WhatsApp to send a link to the bill. ",w)}function saveAndLink(file,win,linked){save(file);return linked.then(function(url){openWa(url,win,"The PDF is in your downloads.")})}function shareLink(url,problem){if(!url){say(problem);return}return navigator.share({text:cfg.text+" "+url}).then(function(){say("Shared a link to the bill: whoever opens it can download the PDF.")},function(e){if(e&&e.name==="AbortError"){say("");return}say("Tap Open WhatsApp to send a link to the bill. ",wa(url))})}function shareFile(file){return navigator.share({files:[file],text:cfg.text}).then(function(){ready=null;say("")},function(e){if(e&&e.name==="AbortError"){say("");return}if(e&&e.name==="NotAllowedError"&&!ready){ready=file;say("Your PDF is ready. Tap Share PDF on WhatsApp again to send it.");return}ready=null;return saveAndLink(file,null,link())})}shareBtn.addEventListener("click",function(){if(ready){shareFile(ready);return}var phone=window.matchMedia("(pointer: coarse)").matches,native=phone&&canShareFiles(),win=phone?null:waiting();busy(true);say("Making the PDF…");var linked=link(),problem=GENERIC,made=pdf().catch(function(e){problem=e&&e.shown?e.message:GENERIC;return null});(native?Promise.race([made,new Promise(function(r){setTimeout(function(){r(null)},3500)})]).then(function(file){return file?shareFile(file):linked.then(function(url){return shareLink(url,problem)})}):made.then(function(file){if(file)return saveAndLink(file,win,linked);return linked.then(function(url){if(url){openWa(url,win,problem);return}if(win)win.close();say(problem)})})).catch(function(){say(GENERIC)}).then(function(){busy(false)})});downBtn.addEventListener("click",function(){busy(true);say("Making the PDF…");pdf().then(function(file){save(file);say("The PDF is in your downloads.")}).catch(function(e){say(e&&e.shown?e.message:GENERIC)}).then(function(){busy(false)})});})();`;

/** The bar's HTML, with its own styles and script, for the top of a bill page; empty without a bar. */
export function billBar(bar: BillBar | null | undefined, accent = "#1e3a8a") {
  if (!bar) return "";
  const share = bar.share;
  // JSON in a script: "<" escaped so a name can never close the script tag
  const data = `window.__billShare=${share ? JSON.stringify(share).replace(/</g, "\\u003c") : "null"};window.__billAutoPrint=${bar.autoPrint ? "true" : "false"};`;
  const style = `.bill-bar{display:flex;flex-wrap:wrap;gap:8px 10px;align-items:center;margin:0 0 16px;font-family:Arial,Helvetica,sans-serif}.bill-bar [hidden]{display:none!important}.bill-bar button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 18px;border-radius:10px;font:700 15px Arial,Helvetica,sans-serif;cursor:pointer}.bill-bar .bb-back,.bill-bar .bb-print{border:1px solid #cbd5e1;background:#fff;color:#0f172a}.bill-bar .bb-share{border:0;background:#15803d;color:#fff}.bill-bar button:disabled{opacity:.7;cursor:progress}.bill-bar .bb-download{border:0;background:none;padding:0 8px;color:${accent};font-size:14px;text-decoration:underline}.bill-bar output{flex-basis:100%;font-size:13px;color:#475569}.bill-bar output:empty{display:none}.bill-bar .bb-wa{display:flex;width:fit-content;align-items:center;min-height:44px;margin-top:8px;padding:0 16px;border-radius:10px;background:#15803d;color:#fff;font:700 14px Arial,Helvetica,sans-serif;text-decoration:none}@media print{.bill-bar{display:none}}`;
  const buttons = [
    '<button type="button" class="bb-back" id="bb-back" hidden>&larr; Back</button>',
    '<button type="button" class="bb-print" onclick="window.print()">Print bill</button>',
    share
      ? '<button type="button" class="bb-share" id="bb-share">Share PDF on WhatsApp</button><button type="button" class="bb-download" id="bb-download">Download PDF</button><output id="bb-status" aria-live="polite"></output>'
      : "",
  ].join("");
  // a page to print only (a sample bill, opened in a tab of its own) needs no script, and never shows Back
  const script = share || bar.autoPrint ? `<script>${data}${SCRIPT}</script>` : "";
  return `<div class="bill-bar"><style>${style}</style>${buttons}${script}</div>`;
}
