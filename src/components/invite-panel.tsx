"use client";

import { useActionState } from "react";
import { listAction } from "@/lib/lists/actions";
import { ShareLink } from "./share-link";
import { safeAction } from "./safe-action";

const updateSharing = safeAction(listAction);

/** The whole of sharing: WhatsApp, the link, and one switch for whether it lets people edit. */
export function InvitePanel({
  listId,
  url,
  name,
  kind,
  canEdit,
  owner,
  mr,
}: {
  listId: string;
  url: string;
  name: string;
  kind: "board" | "basket";
  canEdit: boolean;
  owner: boolean;
  mr: boolean;
}) {
  const [state, action, pending] = useActionState(updateSharing, {});
  const message =
    kind === "board"
      ? `${mr ? "माझा बोर्ड पाहा" : "Have a look at my board"} “${name}”: ${url}`
      : `${mr ? "आपली बास्केट एकत्र भरूया" : "Let’s fill our basket"} “${name}” ${mr ? "" : "together"}: ${url}`;
  return (
    <div className="invite-panel">
      <a
        className="primary-button"
        href={`https://wa.me/?text=${encodeURIComponent(message)}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        {mr ? "WhatsApp वर पाठवा" : "Send on WhatsApp"}
      </a>
      <ShareLink
        label={mr ? "लिंक" : "Link"}
        url={url}
        hint={mr ? "कोणत्याही चॅट किंवा ईमेलमध्ये चालते." : "Works in any chat or email."}
        title={name}
        copy={mr ? "कॉपी" : "Copy"}
        copied={mr ? "कॉपी केली" : "Copied"}
      />
      {owner && (
        <form action={action} className="switch-row">
          <input type="hidden" name="intent" value="link-edit" />
          <input type="hidden" name="listId" value={listId} />
          <input type="hidden" name="on" value={String(!canEdit)} />
          <span>
            <strong>{mr ? "ते वस्तू जोडू आणि बदलू शकतात" : "They can add and change things"}</strong>
            <small>
              {canEdit
                ? mr ? "लिंक असलेले सामील होऊन बदल करू शकतात." : "Anyone with the link can join and edit."
                : mr ? "लिंक असलेले फक्त पाहू आणि खरेदी करू शकतात." : "Anyone with the link can look and buy, nothing more."}
            </small>
          </span>
          <button
            role="switch"
            aria-checked={canEdit}
            aria-label={mr ? "लिंक असलेले बदल करू शकतात" : "People with the link can add and change things"}
            className="switch"
            disabled={pending}
          >
            <span />
          </button>
        </form>
      )}
      {state.error && <p role="alert" className="error-message">{state.error}</p>}
    </div>
  );
}
