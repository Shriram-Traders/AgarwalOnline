import Link from "next/link";
import { Heart, Plus } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { WishlistItem } from "@/lib/engagement/models";
import { catalog } from "@/lib/catalog/queries";
import { productImages } from "@/lib/catalog/images";
import { User } from "@/lib/db/models";
import { describeItems, firstName, listsFor } from "@/lib/lists/service";
import { listAction } from "@/lib/lists/actions";
import { formatPrice } from "@/lib/display";
import { currentLocale } from "@/lib/i18n";
import { ActionForm } from "@/components/action-form";
import { Avatars } from "@/components/avatars";
import { Collage } from "@/components/collage";
import { EmptyState } from "@/components/empty-state";
import { PageHeading } from "@/components/page-heading";
import { ProductCard } from "@/components/product-card";
export const metadata = { title: "Saved", robots: { index: false } };

/** Saved: boards of things to come back to, then everything the heart has saved. */
export default async function SavedPage() {
  const user = await requirePage("profile:own");
  const locale = await currentLocale();
  const mr = locale === "mr";
  const [saved, all, { owned, shared }] = await Promise.all([
    WishlistItem.find({ customerId: user.id }).sort({ createdAt: -1 }).select("productId"),
    catalog(),
    listsFor(user.id, "board"),
  ]);
  const order = saved.map((item) => String(item.productId));
  const products = all
    .filter((product) => order.includes(product.id))
    .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const boards = [...owned, ...shared];
  const [contents, people] = await Promise.all([
    Promise.all(boards.map((board) => describeItems(board.items))),
    User.find({ _id: { $in: boards.flatMap((board) => [board.ownerId, ...board.collaborators]) } }).select("name"),
  ]);
  const nameOf = (id: unknown) => firstName(people.find((p) => String(p._id) === String(id))?.name);
  const photo = (product: (typeof products)[number]) => product.images[0] ?? product.image ?? productImages[product.slug];
  return (
    <section className="page-container">
      <PageHeading
        eyebrow={mr ? "तुमचे खाते" : "YOUR ACCOUNT"}
        title={mr ? "जतन केलेले" : "Saved"}
        lead={mr ? "♡ केलेले सर्व काही, बोर्डवर लावलेले आणि शेअर करता येणारे." : "Everything you hearted, on boards you can share."}
      />
      <div className="board-grid">
        <a href="#all-saved" className="board-tile">
          <Collage images={products.slice(0, 4).map(photo)} />
          <span className="board-tile-name">
            <strong>{mr ? "सर्व जतन केलेले" : "All saved"}</strong>
            <Heart size={16} fill="currentColor" aria-hidden="true" />
          </span>
          <small>{mr ? `${products.length} वस्तू` : `${products.length} item${products.length === 1 ? "" : "s"}`}</small>
        </a>
        {boards.map((board, index) => {
          const rows = contents[index];
          const total = rows.reduce((sum, row) => sum + row.pricePaise * row.quantity, 0);
          const names = [board.ownerId, ...board.collaborators].map(nameOf);
          return (
            <Link key={String(board._id)} href={`/account/lists/${board._id}`} className="board-tile">
              <Collage images={rows.slice(0, 4).map((row) => row.image ?? productImages[row.slug])} />
              <span className="board-tile-name">
                <strong>{board.name}</strong>
                {names.length > 1 && <Avatars names={names} size="sm" label={names.join(", ")} />}
              </span>
              <small>
                {mr ? `${rows.length} वस्तू` : `${rows.length} item${rows.length === 1 ? "" : "s"}`} · {formatPrice(total)}
              </small>
            </Link>
          );
        })}
        <div className="board-tile board-new">
          <span className="board-new-art" aria-hidden="true">
            <Plus size={28} />
          </span>
          <ActionForm action={listAction} submit={mr ? "बोर्ड बनवा" : "Make board"} buttonClassName="secondary-button">
            <input type="hidden" name="intent" value="create" />
            <input type="hidden" name="kind" value="board" />
            <label>
              {mr ? "नवीन बोर्ड" : "New board"}
              <input name="name" maxLength={60} required placeholder={mr ? "दिवाळी भेटी" : "Diwali gifts"} />
            </label>
          </ActionForm>
        </div>
      </div>
      <section className="section" id="all-saved" aria-labelledby="all-saved-title">
        <div className="section-heading">
          <div>
            <h2 id="all-saved-title">{mr ? "सर्व जतन केलेले" : "All saved"}</h2>
          </div>
        </div>
        {products.length ? (
          <div className="product-grid">
            {products.map((product, index) => (
              <ProductCard key={product.id} product={product} locale={locale} saved eager={index === 0} />
            ))}
          </div>
        ) : (
          <EmptyState
            heading="h3"
            icon={Heart}
            title={mr ? "अजून काही जतन केलेले नाही" : "Nothing saved yet"}
            body={mr ? "कोणत्याही उत्पादनावर ♡ टॅप करा आणि ते इथे दिसेल." : "Tap ♡ on any product and it appears here."}
            action={
              <Link className="primary-button" href="/catalog">
                {mr ? "उत्पादने पाहा" : "Browse products"}
              </Link>
            }
          />
        )}
      </section>
    </section>
  );
}
