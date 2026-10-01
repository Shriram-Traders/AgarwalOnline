import { beforeEach, describe, expect, it, vi } from "vitest";

// the order page's form handler on its own: the session, the cache and the service are stand-ins
const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string, type?: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url, type });
  }),
  // a packer by default; the owner is the one who can refund
  requirePermission: vi.fn(async () => ({
    id: "665f00000000000000000001",
    roles: ["customer", "admin"],
  })),
  service: {
    changeOrderStatus: vi.fn(),
    savePacking: vi.fn(),
    assignDelivery: vi.fn(),
    partnerTransition: vi.fn(),
    requestDeliveryOTP: vi.fn(),
    completeDelivery: vi.fn(),
    reconcileCOD: vi.fn(),
    resolveCODDiscrepancy: vi.fn(),
    cancelByStore: vi.fn(),
    retryDelivery: vi.fn(),
    returnToShop: vi.fn(),
    changeRider: vi.fn(),
    removeRider: vi.fn(),
  },
}));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  RedirectType: { push: "push", replace: "replace" },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../src/lib/auth/session", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("../src/lib/operations/service", () => mocks.service);

import { operationAction } from "../src/lib/operations/actions";

const ORDER = "665f000000000000000000aa";
function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("Order page steps whose panel goes away", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["cancel", "cancelByStore", "order-closed"],
    ["return-to-shop", "returnToShop", "order-closed"],
    ["retry-delivery", "retryDelivery", "assign-rider"],
    ["remove-rider", "removeRider", "assign-rider"],
  ] as const)(
    "%s lands on the part of the order that shows the outcome",
    async (operation, step, anchor) => {
      await expect(
        operationAction(
          {},
          form({ operation, orderId: ORDER, reason: "Customer asked on the phone" }),
        ),
      ).rejects.toMatchObject({ url: `/admin/orders/${ORDER}#${anchor}`, type: "replace" });
      expect(mocks.service[step]).toHaveBeenCalledOnce();
    },
  );

  it("stays on the form with a plain message when the step is refused", async () => {
    mocks.service.cancelByStore.mockRejectedValueOnce(
      Error(
        "This order was paid online, so the refund comes first: the owner handles it separately from the Refunds page. Once the full amount is refunded, you can close the order here.",
      ),
    );
    const result = await operationAction(
      {},
      form({ operation: "cancel", orderId: ORDER, reason: "Customer asked" }),
    );
    expect(result.error).toMatch(/^This order was paid online/);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("reads every packing line from the form, and says what the save did", async () => {
    mocks.service.savePacking.mockResolvedValueOnce({
      complete: true,
      waiting: [],
      changed: true,
      charged: true,
      totalPaise: 16400,
      originalTotalPaise: 24500,
      ownersTold: 0,
      recount: [],
      substitutes: [],
    });
    const data = form({ operation: "packing", orderId: ORDER });
    data.set("packed_665f00000000000000000011", "1");
    data.set("missing_665f00000000000000000011", "on");
    data.set("substitution_665f00000000000000000011", "Navneet notebook");
    data.set("substitutes_665f00000000000000000011", "1");
    // an empty box is not a count of none: the service is told it is missing
    data.set("packed_665f00000000000000000012", " ");
    data.set("substitution_665f00000000000000000012", "Reynolds pen");
    data.set("substitutes_665f00000000000000000012", "");
    const result = await operationAction({}, data);
    expect(mocks.service.savePacking).toHaveBeenCalledWith("665f00000000000000000001", {
      orderId: ORDER,
      items: [
        {
          variantId: "665f00000000000000000011",
          packedQuantity: 1,
          missing: true,
          substitution: "Navneet notebook",
          substituteQuantity: 1,
        },
        {
          variantId: "665f00000000000000000012",
          packedQuantity: undefined,
          missing: false,
          substitution: "Reynolds pen",
          // blank: all of the rest went in as the substitute
          substituteQuantity: undefined,
        },
      ],
    });
    expect(result).toEqual({
      success: "Saved. The bill is now ₹164 (was ₹245), and the customer has been told.",
    });
  });

  it("asks for the stock count to be put right for what the shelf didn't have and for substitutes", async () => {
    mocks.service.savePacking.mockResolvedValueOnce({
      complete: true,
      waiting: [],
      changed: true,
      charged: true,
      totalPaise: 21000,
      originalTotalPaise: 27000,
      ownersTold: 0,
      recount: ["Notebook (Single ruled)", "Glue stick (15 g)"],
      substitutes: ["1 × Navneet notebook"],
    });
    expect(
      (await operationAction({}, form({ operation: "packing", orderId: ORDER, packed_665f00000000000000000011: "1" })))
        .success,
    ).toBe(
      "Saved. The bill is now ₹210 (was ₹270), and the customer has been told. Check the stock count for Notebook (Single ruled) and Glue stick (15 g): the shelf had fewer than it shows. Fix it on the Stock page. Take 1 × Navneet notebook off its stock count too, as it went in instead.",
    );
  });

  it("says who refunds an online payment for items not packed: the owner, who has been told", async () => {
    const paidOnline = {
      complete: true,
      waiting: [],
      changed: true,
      charged: false,
      totalPaise: 24500,
      shortfallPaise: 8100,
      recount: [],
      substitutes: [],
    };
    const packing = () =>
      form({ operation: "packing", orderId: ORDER, packed_665f00000000000000000011: "2" });
    mocks.service.savePacking.mockResolvedValueOnce({ ...paidOnline, ownersTold: 1 });
    expect((await operationAction({}, packing())).success).toBe(
      "Saved, and the customer has been told what changed. They paid online, so the owner refunds the ₹81 from the Refunds page, and has been told.",
    );
    // saved again with the same amount owed (say, only a substitute changed): no new message, but
    // it stays on the owner's work queue
    mocks.service.savePacking.mockResolvedValueOnce({ ...paidOnline, ownersTold: 0 });
    expect((await operationAction({}, packing())).success).toBe(
      "Saved, and the customer has been told what changed. They paid online, so the owner refunds the ₹81 from the Refunds page; it is on their work queue.",
    );
    // the owner packing it refunds it themselves
    mocks.requirePermission.mockResolvedValueOnce({
      id: "665f00000000000000000002",
      roles: ["customer", "super-admin"],
    });
    mocks.service.savePacking.mockResolvedValueOnce({ ...paidOnline, ownersTold: 0 });
    expect((await operationAction({}, packing())).success).toBe(
      "Saved, and the customer has been told what changed. They paid online: refund the ₹81 from the Refunds page.",
    );
  });

  it("says which packing lines still need a word, and passes a packing problem through", async () => {
    mocks.service.savePacking.mockResolvedValueOnce({
      complete: false,
      waiting: ["Notebook (Single ruled): 2 of 3 packed"],
      changed: false,
      charged: true,
      totalPaise: 27000,
      ownersTold: 0,
      recount: [],
      substitutes: [],
    });
    const packing = () =>
      form({ operation: "packing", orderId: ORDER, packed_665f00000000000000000011: "2" });
    expect(await operationAction({}, packing())).toEqual({
      success:
        "Saved, but not finished: Notebook (Single ruled): 2 of 3 packed. For each, tick “The rest isn’t available” or name the substitute.",
    });
    for (const message of [
      "Check Notebook (Single ruled): say how many Navneet went in, under “How many went in instead”. The others count as not available, as “The rest isn’t available” is ticked.",
      "Check Notebook (Single ruled): “1 short” isn’t a substitute. Tick “The rest isn’t available” instead, or name the product you packed.",
      "Nothing is packed for this order. If none of it is in the shop, cancel the order instead.",
    ]) {
      mocks.service.savePacking.mockRejectedValueOnce(Error(message));
      expect(await operationAction({}, packing())).toEqual({ error: message });
    }
    // "Mark packed" on a checklist finished before orders followed their packing
    const again =
      "Complete the packing checklist first: save it once more, so the order shows what was packed for Notebook (Single ruled).";
    mocks.service.changeOrderStatus.mockRejectedValueOnce(Error(again));
    expect(
      await operationAction(
        {},
        form({ operation: "status", orderId: ORDER, dimension: "fulfilment", next: "packed" }),
      ),
    ).toEqual({ error: again });
  });

  it("changes the rider in place: the Rider panel stays, with its message", async () => {
    const result = await operationAction(
      {},
      form({ operation: "change-rider", orderId: ORDER, partnerId: "665f000000000000000000bb" }),
    );
    expect(result).toEqual({ success: "Rider changed." });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
