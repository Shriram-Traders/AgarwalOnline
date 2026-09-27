import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Heart, MoreHorizontal } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { currentLocale } from "@/lib/i18n";
import { getEnv } from "@/lib/env";
import { User } from "@/lib/db/models";
import { describeItems, firstName, memberList } from "@/lib/lists/service";
import { listAction } from "@/lib/lists/actions";
import { productImages } from "@/lib/catalog/images";
import { formatPrice } from "@/lib/display";
import { ActionForm } from "@/components/action-form";
import { Avatars } from "@/components/avatars";
import { CartLineControls } from "@/components/cart-line-controls";
import { EmptyState } from "@/components/empty-state";
import { InvitePanel } from "@/components/invite-panel";
import { PageHeading } from "@/components/page-heading";
import { Popover } from "@/components/popover";
import { ShareSheet } from "@/components/share-sheet";
export const metadata = { title: "Board", robots: { index: false } };

/** A board: saved things as photo tiles, who is on it, and one button to buy the lot. */
export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage("cart:own");
  const list = await memberList(user.id, (await params).id);
  if (!list) notFound();
  if (list.kind !== "board") redirect(`/cart?basket=${list._id}`);
  const locale = await currentLocale();
  const mr = locale === "mr";
  const id = String(list._id);
  const owner = String(list.ownerId) === user.id;
  const [rows, people] = await Promise.all([
    describeItems(list.items),
    User.find({ _id: { $in: [list.ownerId, ...list.collaborators] } }).select("name"),
  ]);
  const nameOf = (person: unknown) => people.find((p) => String(p._id) === String(person))?.name ?? "Someone";
  const everyone = [list.ownerId, ...list.collaborators];
  const others = everyone.filter((p) => String(p) !== user.id).map((p) => firstName(nameOf(p)));
  const peopleLine = others.length
    ? `${mr ? "तुम्ही, " : "You, "}${new Intl.ListFormat(mr ? "mr" : "en", { type: "conjunction" }).format(others)}`
    : mr ? "सध्या फक्त तुम्ही" : "Only you so far";
  const total = rows.reduce((sum, row) => sum + row.pricePaise * row.quantity, 0);
  const hidden = (intent: string, extra: Record<string, string> = {}) =>
    Object.entries({ intent, listId: id, back: "/account/wishlist", ...extra }).map(([name, value]) => (
      <input key={name} type="hidden" name={name} value={value} />
    ));
  return (
    <section className="page-container">
      <Link href="/account/wishlist" className="back-link">
        <ArrowLeft size={16} aria-hidden="true" /> {mr ? "जतन केलेले" : "Saved"}
      </Link>
      <PageHeading
        eyebrow={owner ? (mr ? "तुमचा बोर्ड" : "YOUR BOARD") : mr ? `${firstName(nameOf(list.ownerId))} यांचा बोर्ड` : `${firstName(nameOf(list.ownerId))}’s board`}
        title={list.name}
        lead={`${mr ? `${rows.length} वस्तू` : `${rows.length} item${rows.length === 1 ? "" : "s"}`} · ${formatPrice(total)}`}
        aside={
          <Popover className="overflow-menu" label={mr ? "आणखी पर्याय" : "More options"} summary={<MoreHorizontal size={20} aria-hidden="true" />}>
            {owner ? (
              <ActionForm
                action={listAction}
                submit={mr ? "बोर्ड हटवा" : "Delete board"}
                className="list-inline-form"
                buttonClassName="text-button"
                confirmMessage={mr ? "हा बोर्ड सर्वांसाठी हटवला जाईल. जतन केलेल्या वस्तू राहतील." : "This deletes the board for everyone on it. Your saved things stay saved."}
              >
                {hidden("delete")}
              </ActionForm>
            ) : (
              <ActionForm
                action={listAction}
                submit={mr ? "बोर्ड सोडा" : "Leave board"}
                className="list-inline-form"
                buttonClassName="text-button"
                confirmMessage={mr ? "तुम्हाला हा बोर्ड दिसणार नाही जोपर्यंत पुन्हा आमंत्रण मिळत नाही." : "You will no longer see this board unless you are invited again."}
              >
                {hidden("leave")}
              </ActionForm>
            )}
          </Popover>
        }
      />
      <div className="people-strip">
        <Avatars names={everyone.map(nameOf)} label={everyone.map(nameOf).join(", ")} />
        <span>{peopleLine}</span>
        {owner && (
          <ShareSheet
            label={mr ? "आमंत्रित करा" : "Invite"}
            title={mr ? `“${list.name}” मध्ये आमंत्रित करा` : `Invite to “${list.name}”`}
            closeLabel={mr ? "बंद करा" : "Close"}
          >
            <InvitePanel
              listId={id}
              url={`${getEnv().APP_ORIGIN}/lists/${list.inviteToken}`}
              name={list.name}
              kind="board"
              canEdit={list.linkCanEdit !== false}
              owner
              mr={mr}
            />
            <h3 className="share-subhead">{mr ? "बोर्डवरील लोक" : "People on this board"}</h3>
            <ul className="people-list">
              {everyone.map((person, index) => (
                <li key={String(person)}>
                  <span className="people-row">
                    <Avatars names={[nameOf(person)]} size="sm" />
                    <span>
                      <strong>{nameOf(person)}{String(person) === user.id ? (mr ? " (तुम्ही)" : " (you)") : ""}</strong>
                      <small>{index === 0 ? (mr ? "मालक" : "Owner") : mr ? "बदल करू शकतात" : "Can edit"}</small>
                    </span>
                  </span>
                  {index > 0 && (
                    <ActionForm
                      action={listAction}
                      submit={mr ? "काढा" : `Remove ${firstName(nameOf(person))}`}
                      className="list-inline-form"
                      buttonClassName="secondary-button compact-button"
                      confirmMessage={mr ? `${nameOf(person)} यांना हा बोर्ड दिसणार नाही.` : `${nameOf(person)} will no longer see or change this board.`}
                    >
                      {hidden("remove-person", { personId: String(person) })}
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
            <ActionForm
              action={listAction}
              submit={mr ? "नवीन लिंक बनवा" : "Make a new link"}
              className="list-inline-form"
              buttonClassName="text-button"
              confirmMessage={mr ? "सध्याची लिंक बंद होईल. आधीच असलेले लोक राहतील." : "The current link stops working. People already on the board stay."}
            >
              {hidden("reset")}
            </ActionForm>
          </ShareSheet>
        )}
      </div>
      {rows.length ? (
        <div className="board-items">
          {rows.map((row) => {
            const image = row.image ?? productImages[row.slug];
            return (
              <article className="board-item" key={row.variantId}>
                <Link href={`/products/${row.slug}`} className="board-item-art" tabIndex={-1} aria-hidden="true">
                  {image && <Image src={image} alt="" fill sizes="(max-width: 760px) 45vw, 220px" unoptimized />}
                </Link>
                <span className="board-item-by">
                  <Avatars names={[row.addedBy]} size="sm" label={mr ? `${row.addedBy} यांनी जोडले` : `Added by ${row.addedBy}`} />
                </span>
                <h3 lang={locale}>
                  <Link href={`/products/${row.slug}`}>{row.name[locale]}</Link>
                </h3>
                <p className="muted">{row.label}{row.available < 1 ? (mr ? " · उपलब्ध नाही" : " · Out of stock") : ""}</p>
                <div className="board-item-foot">
                  <strong>{formatPrice(row.pricePaise)}</strong>
                  <CartLineControls
                    action={listAction}
                    fields={{ intent: "set", listId: id }}
                    variantId={row.variantId}
                    quantity={row.quantity}
                    max={row.maxQuantity}
                    name={row.name.en}
                  />
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={Heart}
          title={mr ? "या बोर्डवर अजून काही नाही" : "Nothing on this board yet"}
          body={mr ? "कोणतेही उत्पादन उघडा, “जतन करा” वर टॅप करा आणि हा बोर्ड निवडा." : "Open any product, tap Save and pick this board."}
          action={
            <Link className="primary-button" href="/catalog">
              {mr ? "उत्पादने पाहा" : "Browse products"}
            </Link>
          }
        />
      )}
      {rows.length > 0 && (
        <div className="buy-bar">
          <ActionForm action={listAction} submit={`${mr ? "हा बोर्ड खरेदी करा" : "Buy this board"} · ${formatPrice(total)}`}>
            {hidden("checkout")}
          </ActionForm>
        </div>
      )}
    </section>
  );
}
