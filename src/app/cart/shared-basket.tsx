import Image from "next/image";
import Link from "next/link";
import { MoreHorizontal, Plus, ShoppingBag } from "lucide-react";
import { getEnv } from "@/lib/env";
import { User } from "@/lib/db/models";
import { deliveryRules } from "@/lib/commerce/service";
import { describeItems, firstName } from "@/lib/lists/service";
import { listAction } from "@/lib/lists/actions";
import { productImages } from "@/lib/catalog/images";
import { formatPrice } from "@/lib/display";
import { ActionForm } from "@/components/action-form";
import { Avatars } from "@/components/avatars";
import { NameIdeas } from "@/components/name-ideas";
import { CartLineControls } from "@/components/cart-line-controls";
import { EmptyState } from "@/components/empty-state";
import { InvitePanel } from "@/components/invite-panel";
import { PageHeading } from "@/components/page-heading";
import { Popover } from "@/components/popover";
import { ShareSheet } from "@/components/share-sheet";

type Basket = { _id: unknown; name: string; items: { quantity: number }[] };

/** Switch between your own basket and the ones you fill with other people. */
export function BasketPills({
  current,
  mine,
  baskets,
  mr,
}: {
  current: string;
  mine?: number;
  baskets: Basket[];
  mr: boolean;
}) {
  const count = (b: Basket) => b.items.reduce((n, item) => n + item.quantity, 0);
  return (
    <nav className="basket-pills" aria-label={mr ? "तुमच्या बास्केट" : "Your baskets"}>
      <Link href="/cart" aria-current={current === "mine" ? "page" : undefined}>
        {mr ? "माझी बास्केट" : "My basket"}
        {mine !== undefined && <span>{mine}</span>}
      </Link>
      {baskets.map((b) => (
        <Link key={String(b._id)} href={`/cart?basket=${b._id}`} aria-current={current === String(b._id) ? "page" : undefined}>
          {b.name}
          <span>{count(b)}</span>
        </Link>
      ))}
      <Link href="/cart?basket=new" className="basket-pill-new" aria-current={current === "new" ? "page" : undefined}>
        <Plus size={16} aria-hidden="true" /> {mr ? "नवीन" : "New"}
      </Link>
    </nav>
  );
}

const IDEAS = ["School list", "Family monthly", "Office restock", "Festival shopping"];
const IDEAS_MR = ["शाळेची यादी", "महिन्याची खरेदी", "ऑफिस साहित्य", "सणाची खरेदी"];

export function NewBasket({ baskets, mr }: { baskets: Basket[]; mr: boolean }) {
  return (
    <section className="page-container">
      <PageHeading title={mr ? "बास्केट" : "Basket"} />
      <BasketPills current="new" baskets={baskets} mr={mr} />
      <div className="panel new-basket">
        <h2>{mr ? "नवीन बास्केट" : "A new basket"}</h2>
        <p className="muted">
          {mr
            ? "कुटुंब किंवा सहकाऱ्यांसोबत भरण्यासाठी दुसरी बास्केट. कोणीही ऑर्डर करू शकतो."
            : "A second basket to fill with family or colleagues. Anyone on it can order it."}
        </p>
        <ActionForm action={listAction} submit={mr ? "बास्केट बनवा" : "Make basket"} className="form-stack list-create">
          <input type="hidden" name="intent" value="create" />
          <input type="hidden" name="kind" value="basket" />
          <label>
            {mr ? "नाव" : "Name"}
            <NameIdeas
              name="name"
              ideas={mr ? IDEAS_MR : IDEAS}
              placeholder={mr ? IDEAS_MR[0] : IDEAS[0]}
              ideasLabel={mr ? "कल्पना" : "Ideas"}
            />
          </label>
        </ActionForm>
      </div>
    </section>
  );
}

/** A basket filled together: it looks and works like your own, and anyone on it can order it. */
export async function SharedBasket({
  userId,
  list,
  baskets,
  mr,
}: {
  userId: string;
  list: Basket & {
    ownerId: unknown;
    collaborators: unknown[];
    inviteToken: string;
    linkCanEdit?: boolean;
    items: { variantId: unknown; quantity: number; addedBy: unknown }[];
  };
  baskets: Basket[];
  mr: boolean;
}) {
  const id = String(list._id);
  const owner = String(list.ownerId) === userId;
  const [rows, people, rules] = await Promise.all([
    describeItems(list.items),
    User.find({ _id: { $in: [list.ownerId, ...list.collaborators] } }).select("name"),
    deliveryRules(),
  ]);
  const nameOf = (person: unknown) => people.find((p) => String(p._id) === String(person))?.name ?? "Someone";
  const everyone = [list.ownerId, ...list.collaborators];
  const others = everyone.filter((p) => String(p) !== userId).map((p) => firstName(nameOf(p)));
  const together = new Intl.ListFormat(mr ? "mr" : "en", { type: "conjunction" });
  const subtotal = rows.reduce((sum, row) => sum + row.pricePaise * row.quantity, 0);
  const delivery = subtotal >= rules.freeThresholdPaise ? 0 : 3000;
  const hidden = (intent: string, extra: Record<string, string> = {}) =>
    Object.entries({ intent, listId: id, back: "/cart", ...extra }).map(([name, value]) => (
      <input key={name} type="hidden" name={name} value={value} />
    ));
  return (
    <section className="page-container">
      <PageHeading
        title={mr ? "बास्केट" : "Basket"}
        aside={
          <Popover className="overflow-menu" label={mr ? "आणखी पर्याय" : "More options"} summary={<MoreHorizontal size={20} aria-hidden="true" />}>
            {owner ? (
              <ActionForm
                action={listAction}
                submit={mr ? "ही बास्केट हटवा" : "Delete this basket"}
                className="list-inline-form"
                buttonClassName="text-button"
                confirmMessage={mr ? "ही बास्केट सर्वांसाठी हटवली जाईल." : "This deletes the basket for everyone on it."}
              >
                {hidden("delete")}
              </ActionForm>
            ) : (
              <ActionForm
                action={listAction}
                submit={mr ? "बास्केट सोडा" : "Leave this basket"}
                className="list-inline-form"
                buttonClassName="text-button"
                confirmMessage={mr ? "तुम्हाला ही बास्केट दिसणार नाही जोपर्यंत पुन्हा आमंत्रण मिळत नाही." : "You will no longer see this basket unless you are invited again."}
              >
                {hidden("leave")}
              </ActionForm>
            )}
          </Popover>
        }
      />
      <BasketPills current={id} baskets={baskets} mr={mr} />
      <div className="basket-layout">
        <div>
          <ShareSheet
            label={mr ? "ही बास्केट शेअर करा" : "Share this basket"}
            title={mr ? `“${list.name}” शेअर करा` : `Share “${list.name}”`}
            closeLabel={mr ? "बंद करा" : "Close"}
            triggerClassName={`share-strip${others.length ? " shared" : ""}`}
            trigger={
              <>
                <Avatars names={everyone.map(nameOf)} />
                <span>
                  <strong>
                    {others.length
                      ? `${mr ? "यांच्यासोबत: " : "Shared with "}${together.format(others)}`
                      : mr ? "फक्त तुम्ही" : "Only you"}
                  </strong>
                  <small>
                    {others.length
                      ? mr ? "सगळे ही बास्केट भरतात. कोणीही ऑर्डर करू शकतो." : "Everyone fills this basket. Anyone can order it."
                      : mr ? "शेअर करा म्हणजे इतरही भरू शकतील." : "Share it and others can fill it too."}
                  </small>
                </span>
                <span className="share-strip-action">{owner ? (others.length ? (mr ? "व्यवस्थापित करा" : "Manage") : mr ? "शेअर करा" : "Share") : mr ? "लोक" : "People"}</span>
              </>
            }
          >
            {owner ? (
              <InvitePanel
                listId={id}
                url={`${getEnv().APP_ORIGIN}/lists/${list.inviteToken}`}
                name={list.name}
                kind="basket"
                canEdit={list.linkCanEdit !== false}
                owner
                mr={mr}
              />
            ) : (
              <p className="muted">{mr ? "फक्त मालक नवीन लोकांना आमंत्रित करू शकतात." : "Only the owner can invite new people."}</p>
            )}
            <h3 className="share-subhead">{mr ? "बास्केटमधील लोक" : "People on this basket"}</h3>
            <ul className="people-list">
              {everyone.map((person, index) => (
                <li key={String(person)}>
                  <span className="people-row">
                    <Avatars names={[nameOf(person)]} size="sm" />
                    <span>
                      <strong>{nameOf(person)}{String(person) === userId ? (mr ? " (तुम्ही)" : " (you)") : ""}</strong>
                      <small>{index === 0 ? (mr ? "मालक" : "Owner") : mr ? "बदल करू शकतात" : "Can edit"}</small>
                    </span>
                  </span>
                  {owner && index > 0 && (
                    <ActionForm
                      action={listAction}
                      submit={mr ? "काढा" : `Remove ${firstName(nameOf(person))}`}
                      className="list-inline-form"
                      buttonClassName="secondary-button compact-button"
                      confirmMessage={mr ? `${nameOf(person)} यांना ही बास्केट दिसणार नाही.` : `${nameOf(person)} will no longer see or change this basket.`}
                    >
                      {hidden("remove-person", { personId: String(person) })}
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
            {owner && (
              <ActionForm
                action={listAction}
                submit={mr ? "नवीन लिंक बनवा" : "Make a new link"}
                className="list-inline-form"
                buttonClassName="text-button"
                confirmMessage={mr ? "सध्याची लिंक बंद होईल. आधीच असलेले लोक राहतील." : "The current link stops working. People already on the basket stay."}
              >
                {hidden("reset")}
              </ActionForm>
            )}
          </ShareSheet>
          {rows.length ? (
            rows.map((row) => {
              const image = row.image ?? productImages[row.slug];
              return (
                <div className="basket-line panel" key={row.variantId}>
                  <div className="basket-product">
                    <div className="basket-thumb">
                      {image && <Image src={image} alt="" fill sizes="96px" unoptimized />}
                    </div>
                    <div>
                      <h3>
                        <Link href={`/products/${row.slug}`}>{row.name.en}</Link>
                      </h3>
                      <p className="muted">
                        {row.label} · {formatPrice(row.pricePaise)} {mr ? "प्रत्येकी" : "each"}
                      </p>
                      <p className="muted">
                        {mr ? `${row.addedBy} यांनी जोडले` : `Added by ${row.addedBy}`}
                        {row.available < 1 ? (mr ? " · उपलब्ध नाही" : " · Out of stock") : ""}
                      </p>
                    </div>
                  </div>
                  <CartLineControls
                    action={listAction}
                    fields={{ intent: "set", listId: id }}
                    variantId={row.variantId}
                    quantity={row.quantity}
                    max={row.maxQuantity}
                    name={row.name.en}
                  />
                  <strong>{formatPrice(row.pricePaise * row.quantity)}</strong>
                </div>
              );
            })
          ) : (
            <EmptyState
              icon={ShoppingBag}
              title={mr ? `“${list.name}” अजून रिकामी आहे` : `“${list.name}” is empty`}
              body={
                mr
                  ? "कोणत्याही उत्पादनावर “दुसऱ्या बास्केटमध्ये जोडा” निवडा."
                  : "On any product, tap “Add to a different basket” and pick this one."
              }
              action={
                <Link className="primary-button" href="/catalog">
                  {mr ? "दुकान पाहा" : "Explore the store"}
                </Link>
              }
            />
          )}
          {rows.length > 0 && (
            <Link href="/catalog" className="add-more">
              <Plus size={18} aria-hidden="true" /> {mr ? "दुकानातून आणखी जोडा" : "Add more from the store"}
            </Link>
          )}
        </div>
        {rows.length > 0 && (
          <aside className="panel">
            <h2>{mr ? "सारांश" : "Summary"}</h2>
            <p>
              {mr ? "वस्तू" : "Items"} <strong>{formatPrice(subtotal)}</strong>
            </p>
            <p>
              {mr ? "अंदाजे वितरण" : "Estimated delivery"} <strong>{delivery ? formatPrice(delivery) : mr ? "मोफत" : "FREE"}</strong>
            </p>
            <hr />
            <h3>
              {mr ? "अंदाजे एकूण" : "Estimated total"} <strong>{formatPrice(subtotal + delivery)}</strong>
            </h3>
            <ActionForm action={listAction} submit={mr ? `“${list.name}” ऑर्डर करा` : `Order ${list.name}`}>
              {hidden("checkout")}
            </ActionForm>
            <p className="muted summary-note">
              {mr
                ? "ऑर्डर करताना या वस्तू तुमच्या बास्केटमध्ये जातात. ही बास्केट पुढच्या वेळेसाठी राहते."
                : "Ordering moves these into your basket for checkout. This basket stays for next time."}
            </p>
          </aside>
        )}
      </div>
    </section>
  );
}
