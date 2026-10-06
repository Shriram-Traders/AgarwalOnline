import { connectDB } from "../db/connect";
import { Product, ProductVariant, User } from "../db/models";
import { Order } from "../commerce/models";
import { objectId } from "../commerce/service";
import { assertPermission, type Role } from "../auth/permissions";
import { ProductReview } from "./models";

/**
 * Saves a customer's review of a product they received. A first review goes live; editing one
 * keeps whatever the shop decided about it, so a review staff hid stays hidden.
 * Returns null when no delivered order of theirs holds the product.
 */
export async function saveReview(
  customerId: string,
  data: { productId: string; rating: number; title: string; body: string },
): Promise<"published" | "hidden" | null> {
  await connectDB();
  // every pack, hidden ones too: someone who bought a pack since hidden can still review
  const variantIds = await ProductVariant.find({ productId: data.productId }).distinct("_id");
  const verifiedOrder = await Order.findOne({
    customerId,
    deliveryStatus: "delivered",
    "items.variantId": { $in: variantIds },
  })
    .sort({ createdAt: -1 })
    .select("_id");
  if (!verifiedOrder) return null;
  const review = await ProductReview.findOneAndUpdate(
    { customerId, productId: data.productId },
    {
      $set: { verifiedOrderId: verifiedOrder._id, rating: data.rating, title: data.title, body: data.body },
      $setOnInsert: { status: "published" },
    },
    { upsert: true, runValidators: true, returnDocument: "after" },
  );
  return review.status;
}

const PAGE_SIZE = 20;
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type OwnerReview = {
  id: string;
  product: string;
  slug?: string;
  customer: string;
  rating: number;
  title?: string;
  body?: string;
  status: "published" | "hidden";
  moderationReason?: string;
  createdAt: Date;
};

/** Every product review, shown or hidden, newest first: the reported ones have their own page. */
export async function reviewsForOwner(actorId: string, input: { q?: string; rating?: number; page?: number }) {
  await connectDB();
  const user = await User.findOne({ _id: objectId.parse(actorId), active: true }).select("roles");
  if (!user) throw Error("UNAUTHENTICATED");
  assertPermission(user.roles as Role[], "review:moderate");
  const term = input.q?.trim().slice(0, 80);
  const match = term ? new RegExp(escapeRegex(term), "i") : null;
  const [productIds, customerIds] = match
    ? await Promise.all([
        Product.find({ $or: [{ "name.en": match }, { "name.mr": match }] }).limit(200).distinct("_id"),
        User.find({ name: match }).limit(200).distinct("_id"),
      ])
    : [[], []];
  const filter = {
    ...(input.rating ? { rating: input.rating } : {}),
    ...(match
      ? { $or: [{ title: match }, { body: match }, { productId: { $in: productIds } }, { customerId: { $in: customerIds } }] }
      : {}),
  };
  const total = await ProductReview.countDocuments(filter);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(input.page ?? 1) || 1), pages);
  const reviews = await ProductReview.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * PAGE_SIZE)
    .limit(PAGE_SIZE);
  return { rows: await describe(reviews), total, page, pages };
}

/** One review, for the hide/show panel when it isn't on the page being shown. */
export async function reviewForOwner(reviewId: string): Promise<OwnerReview | null> {
  if (!objectId.safeParse(reviewId).success) return null;
  await connectDB();
  const review = await ProductReview.findById(reviewId);
  return review ? (await describe([review]))[0] : null;
}

type ReviewDoc = {
  _id: unknown;
  productId: unknown;
  customerId: unknown;
  rating: number;
  title?: string;
  body?: string;
  status: "published" | "hidden";
  moderationReason?: string;
  createdAt: Date;
};
async function describe(reviews: ReviewDoc[]): Promise<OwnerReview[]> {
  const [products, customers] = await Promise.all([
    Product.find({ _id: { $in: reviews.map((review) => review.productId) } }).select("name slug"),
    User.find({ _id: { $in: reviews.map((review) => review.customerId) } }).select("name"),
  ]);
  return reviews.map((review) => {
    const product = products.find((item) => String(item._id) === String(review.productId));
    const customer = customers.find((item) => String(item._id) === String(review.customerId));
    return {
      id: String(review._id),
      product: (product?.name?.en as string | undefined) ?? "Product review",
      slug: product?.slug as string | undefined,
      customer: (customer?.name as string | undefined) ?? "Customer",
      rating: review.rating,
      title: review.title || undefined,
      body: review.body || undefined,
      status: review.status,
      moderationReason: review.moderationReason || undefined,
      createdAt: review.createdAt,
    };
  });
}
