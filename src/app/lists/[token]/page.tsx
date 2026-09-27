import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ListChecks, UsersRound } from "lucide-react";
import { currentUser } from "@/lib/auth/session";
import { currentLocale } from "@/lib/i18n";
import { User } from "@/lib/db/models";
import { describeItems, firstName, listHref, memberList, sharedList } from "@/lib/lists/service";
import { listAction } from "@/lib/lists/actions";
import { productImages } from "@/lib/catalog/images";
import { formatPrice } from "@/lib/display";
import { ActionForm } from "@/components/action-form";
import { EmptyState } from "@/components/empty-state";
import { PageHeading } from "@/components/page-heading";
export const metadata = { title: "Shared with you", robots: { index: false, follow: false } };

/** What someone sees from a board or basket link: the items, never who else is on it. */
export default async function SharedListLink({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await sharedList(token);
  if (!found) notFound();
  const { list, invite } = found;
  const [user, locale] = await Promise.all([currentUser(), currentLocale()]);
  const mr = locale === "mr";
  const [rows, owner] = await Promise.all([
    describeItems(list.items),
    User.findById(list.ownerId).select("name"),
  ]);
  const ownerName = firstName(owner?.name);
  const member = user && (await memberList(user.id, list._id));
  const signIn = `/login?then=${encodeURIComponent(`/lists/${token}`)}`;
  const total = rows.reduce((sum, row) => sum + row.pricePaise * row.quantity, 0);
  const board = list.kind === "board";
  const noun = board ? (mr ? "बोर्ड" : "board") : mr ? "बास्केट" : "basket";
  return (
    <section className="page-container">
      <PageHeading
        eyebrow={mr ? `${ownerName} यांनी पाठवलेला ${noun}` : `SHARED BY ${ownerName.toUpperCase()}`}
        title={list.name}
        lead={`${mr ? `${rows.length} वस्तू` : `${rows.length} item${rows.length === 1 ? "" : "s"}`} · ${formatPrice(total)}`}
      />
      {invite && (
        <div className="panel invite-callout">
          <UsersRound size={28} aria-hidden="true" />
          <div>
            <h2>{mr ? `${ownerName} यांनी तुम्हाला या ${noun}मध्ये बोलावले आहे` : `${ownerName} invited you to this ${noun}`}</h2>
            <p className="muted">
              {mr
                ? "सामील व्हा आणि वस्तू जोडा किंवा संख्या बदला. सर्वांना त्याच वस्तू दिसतात."
                : board
                  ? "Join to add things and change amounts. Everyone on the board sees the same things."
                  : "Join to fill it together. Everyone on it sees the same basket, and anyone can order it."}
            </p>
          </div>
          {member ? (
            <Link className="primary-button" href={listHref(list)}>
              {mr ? `${noun} उघडा` : `Open the ${noun}`}
            </Link>
          ) : user ? (
            <ActionForm action={listAction} submit={mr ? `${noun}मध्ये सामील व्हा` : `Join this ${noun}`} className="list-inline-form">
              <input type="hidden" name="intent" value="join" />
              <input type="hidden" name="token" value={token} />
            </ActionForm>
          ) : (
            <Link className="primary-button" href={signIn}>
              {mr ? "सामील होण्यासाठी साइन इन करा" : "Sign in to join"}
            </Link>
          )}
        </div>
      )}
      <div className="list-layout">
        <div>
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
                      <h3 lang={locale}>
                        <Link href={`/products/${row.slug}`}>{row.name[locale]}</Link>
                      </h3>
                      <p className="muted">
                        {row.label} · {formatPrice(row.pricePaise)} {mr ? "प्रत्येकी" : "each"}
                      </p>
                    </div>
                  </div>
                  <span className="list-qty">× {row.quantity}</span>
                  <strong>{formatPrice(row.pricePaise * row.quantity)}</strong>
                </div>
              );
            })
          ) : (
            <EmptyState
              icon={ListChecks}
              title={mr ? `हा ${noun} सध्या रिकामा आहे` : `This ${noun} is empty for now`}
              body={mr ? "वस्तू जोडल्या की त्या इथे दिसतील." : "Items appear here as soon as they are added."}
            />
          )}
        </div>
        {rows.length > 0 && (
          <aside>
            <div className="panel list-summary">
              <p className="list-total">
                <span>{mr ? "अंदाजे एकूण" : "Estimated total"}</span>
                <strong>{formatPrice(total)}</strong>
              </p>
              {user ? (
                <>
                  <ActionForm action={listAction} submit={board ? (mr ? "हा बोर्ड खरेदी करा" : "Buy this board") : mr ? "ही बास्केट ऑर्डर करा" : "Order this basket"}>
                    <input type="hidden" name="intent" value="checkout" />
                    <input type="hidden" name="token" value={token} />
                  </ActionForm>
                  <ActionForm
                    action={listAction}
                    submit={mr ? "सर्व बास्केटमध्ये जोडा" : "Add all to basket"}
                    buttonClassName="secondary-button"
                  >
                    <input type="hidden" name="intent" value="basket" />
                    <input type="hidden" name="token" value={token} />
                  </ActionForm>
                </>
              ) : (
                <Link className="primary-button" href={signIn}>
                  {mr ? "बास्केटमध्ये घेण्यासाठी साइन इन करा" : "Sign in to add to basket"}
                </Link>
              )}
              <small className="muted">
                {mr ? "किंमत आणि साठा बास्केटमध्ये पुन्हा तपासला जातो." : "Prices and stock are checked again in your basket."}
              </small>
            </div>
          </aside>
        )}
      </div>
    </section>
  );
}
