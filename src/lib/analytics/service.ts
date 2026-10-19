import { z } from "zod";
import { assertPermission, type Role } from "../auth/permissions";
import { connectDB } from "../db/connect";
import { InventoryItem, Product, ProductVariant, User } from "../db/models";
import { Order } from "../commerce/models";
import { Refund } from "../payments/models";
import { LOW_STOCK } from "../inventory/low-stock";
import { shopSettings } from "../settings/shop";

const dateInput = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

export async function analytics(actorId: string, input: unknown) {
  await connectDB();
  const actor = await User.findOne({ _id: actorId, active: true });
  if (!actor) throw Error("UNAUTHENTICATED");
  assertPermission(actor.roles as Role[], "analytics:read");
  const parsed = dateInput.catch({}).parse(input);
  const end = parsed.to
    ? new Date(`${parsed.to}T23:59:59.999+05:30`)
    : new Date();
  const start = parsed.from
    ? new Date(`${parsed.from}T00:00:00+05:30`)
    : new Date(end.getTime() - ((await shopSettings("defaults")).analyticsDays - 1) * 86400 * 1000);
  const orders = await Order.find({ createdAt: { $gte: start, $lte: end } })
    .select(
      "items totalPaise paymentStatus paymentMethod orderStatus deliveryStatus deliveryDate address.areaName assignedTo customerId createdAt updatedAt",
    )
    .lean()
    .limit(10000);
  const refunds = await Refund.find({
    status: "processed",
    createdAt: { $gte: start, $lte: end },
  }).select("amountPaise");
  const paid = orders.filter((order) =>
    ["paid", "partially-refunded", "refunded"].includes(order.paymentStatus),
  );
  const grossPaise = paid.reduce(
    (sum, order) => sum + (order.totalPaise ?? 0),
    0,
  );
  const refundPaise = refunds.reduce(
    (sum, refund) => sum + refund.amountPaise,
    0,
  );
  const countBy = (key: "orderStatus" | "paymentMethod" | "deliveryStatus") =>
    Object.entries(
      orders.reduce<Record<string, number>>((result, order) => {
        const value = String(order[key]);
        result[value] = (result[value] ?? 0) + 1;
        return result;
      }, {}),
    ).sort((a, b) => b[1] - a[1]);
  const productTotals = new Map<
    string,
    { name: string; quantity: number; revenuePaise: number }
  >();
  const areaTotals = new Map<
    string,
    { orders: number; revenuePaise: number }
  >();
  for (const order of orders) {
    // a cancelled order sold nothing: top products agree with the profit table
    for (const item of order.orderStatus === "cancelled" ? [] : order.items) {
      const key = String(item.variantId);
      const current = productTotals.get(key) ?? {
        name: item.name,
        quantity: 0,
        revenuePaise: 0,
      };
      current.quantity += item.quantity;
      current.revenuePaise += item.linePaise;
      productTotals.set(key, current);
    }
    const area = order.address?.areaName || "Unknown";
    const current = areaTotals.get(area) ?? { orders: 0, revenuePaise: 0 };
    current.orders++;
    if (
      ["paid", "partially-refunded", "refunded"].includes(order.paymentStatus)
    )
      current.revenuePaise += order.totalPaise ?? 0;
    areaTotals.set(area, current);
  }
  const repeatCustomers = new Map<string, number>();
  for (const order of orders) {
    const id = String(order.customerId);
    repeatCustomers.set(id, (repeatCustomers.get(id) ?? 0) + 1);
  }
  const delivered = orders.filter(
    (order) => order.deliveryStatus === "delivered",
  );
  const onTime = delivered.filter((order) => {
    if (!order.deliveryDate) return false;
    return (
      new Date(order.updatedAt).getTime() <=
      new Date(`${order.deliveryDate}T23:59:59.999+05:30`).getTime()
    );
  }).length;
  const partnerTotals = new Map<string, number>();
  delivered.forEach((order) => {
    const id = String(order.assignedTo ?? "Unassigned");
    partnerTotals.set(id, (partnerTotals.get(id) ?? 0) + 1);
  });
  const partners = await User.find({
    _id: { $in: [...partnerTotals.keys()] },
  }).select("name");
  const partnerNames = new Map(
    partners.map((partner) => [String(partner._id), partner.name]),
  );
  const inventory = await InventoryItem.find(LOW_STOCK)
    .sort({ onHand: 1 })
    .limit(30);
  const variants = await ProductVariant.find({
    _id: { $in: inventory.map((item) => item.variantId) },
  }).select("productId sku label");
  const products = await Product.find({
    _id: { $in: variants.map((variant) => variant.productId) },
  }).select("name.en");
  return {
    range: { from: start, to: end },
    metrics: {
      orders: orders.length,
      grossPaise,
      refundPaise,
      netPaise: grossPaise - refundPaise,
      averagePaise: paid.length ? Math.round(grossPaise / paid.length) : 0,
      cancellationRate: orders.length
        ? orders.filter((order) => order.orderStatus === "cancelled").length /
          orders.length
        : 0,
      onTimeRate: delivered.length ? onTime / delivered.length : 0,
      returningCustomers: [...repeatCustomers.values()].filter(
        (count) => count > 1,
      ).length,
      newCustomers: [...repeatCustomers.values()].filter((count) => count === 1)
        .length,
    },
    orderStatuses: countBy("orderStatus"),
    paymentMethods: countBy("paymentMethod"),
    deliveryStatuses: countBy("deliveryStatus"),
    topProducts: [...productTotals.values()]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10),
    areas: [...areaTotals.entries()]
      .map(([name, values]) => ({ name, ...values }))
      .sort((a, b) => b.orders - a.orders),
    partners: [...partnerTotals.entries()]
      .map(([id, deliveries]) => ({
        name: partnerNames.get(id) ?? "Unassigned",
        deliveries,
      }))
      .sort((a, b) => b.deliveries - a.deliveries),
    lowStock: inventory.map((item) => {
      const variant = variants.find(
        (entry) => String(entry._id) === String(item.variantId),
      );
      const product = products.find(
        (entry) => String(entry._id) === String(variant?.productId),
      );
      return {
        id: String(item._id),
        name: product?.name.en ?? variant?.sku ?? "Unknown",
        label: variant?.label ?? "",
        available: item.onHand - item.reserved,
      };
    }),
  };
}

/**
 * Profit for the owners: what each pack sold for in the dates chosen, against its purchase price.
 * Orders that weren't cancelled count; offer discounts come off the total. Delivery charges are
 * left out, as they pay for the delivery.
 * ponytail: uses today's purchase price for past sales; snapshot it on the order if prices swing a lot.
 */
export async function profitReport(actorId: string, input: unknown) {
  await connectDB();
  const actor = await User.findOne({ _id: actorId, active: true });
  if (!actor) throw Error("UNAUTHENTICATED");
  assertPermission(actor.roles as Role[], "settings:write");
  const parsed = dateInput.catch({}).parse(input);
  const end = parsed.to ? new Date(`${parsed.to}T23:59:59.999+05:30`) : new Date();
  const start = parsed.from ? new Date(`${parsed.from}T00:00:00+05:30`) : new Date(end.getTime() - ((await shopSettings("defaults")).analyticsDays - 1) * 86400 * 1000);
  const orders = await Order.find({ createdAt: { $gte: start, $lte: end }, orderStatus: { $ne: "cancelled" } })
    .select("items promotionDiscountPaise")
    .lean()
    .limit(10000);
  const sold = new Map<string, { name: string; label: string; quantity: number; revenuePaise: number }>();
  for (const order of orders)
    for (const item of order.items) {
      const key = String(item.variantId);
      const row = sold.get(key) ?? { name: item.name, label: item.label, quantity: 0, revenuePaise: 0 };
      row.quantity += item.quantity;
      row.revenuePaise += item.linePaise;
      sold.set(key, row);
    }
  const costs = new Map(
    (await ProductVariant.find({ _id: { $in: [...sold.keys()] } }).select("+costPaise").lean<{ _id: unknown; costPaise?: number }[]>()).map(
      (variant) => [String(variant._id), variant.costPaise],
    ),
  );
  const rows = [...sold.entries()]
    .map(([id, row]) => {
      const unitCost = costs.get(id);
      const costPaise = unitCost != null ? unitCost * row.quantity : null;
      return { id, ...row, costPaise, profitPaise: costPaise != null ? row.revenuePaise - costPaise : null };
    })
    .sort((a, b) => (b.profitPaise ?? -Infinity) - (a.profitPaise ?? -Infinity) || b.revenuePaise - a.revenuePaise);
  const priced = rows.filter((row) => row.costPaise != null);
  const discountPaise = orders.reduce((sum, order) => sum + (order.promotionDiscountPaise ?? 0), 0);
  const revenuePaise = rows.reduce((sum, row) => sum + row.revenuePaise, 0);
  const pricedRevenuePaise = priced.reduce((sum, row) => sum + row.revenuePaise, 0);
  const costPaise = priced.reduce((sum, row) => sum + (row.costPaise ?? 0), 0);
  // discounts are shared out over the priced sales by their share of takings
  const pricedDiscount = revenuePaise ? Math.round((discountPaise * pricedRevenuePaise) / revenuePaise) : 0;
  const profitPaise = pricedRevenuePaise - pricedDiscount - costPaise;
  return {
    rows,
    totals: {
      revenuePaise,
      discountPaise,
      costPaise,
      profitPaise,
      margin: pricedRevenuePaise ? profitPaise / pricedRevenuePaise : 0,
      unpriced: rows.length - priced.length,
    },
  };
}
