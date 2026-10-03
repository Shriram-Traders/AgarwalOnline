import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { connectDB } from "../src/lib/db/connect";
import { rolesFor } from "../src/lib/auth/permissions";
import { ChatConversation } from "../src/lib/chat/models";
import { Complaint } from "../src/lib/aftercare/models";
import { ApprovalRequest } from "../src/lib/governance/models";
import { loadQueues, staffCounts } from "../src/lib/admin/work-queues";

const uri = process.env.TEST_MONGODB_URI;

describe.skipIf(!uri)("Staff work queues and menu counts", () => {
  const someone = new mongoose.Types.ObjectId();

  beforeAll(async () => {
    if (!uri?.includes("/ags_test")) throw Error("Isolated DB required");
    Object.assign(process.env, {
      MONGODB_URI: uri,
      APP_ORIGIN: "http://127.0.0.1:3000",
      AUTH_SECRET: "test-secret-".repeat(4),
    });
    await connectDB();
  });

  beforeEach(async () => {
    for (const model of Object.values(mongoose.models)) await model.deleteMany({});
    const old = new Date(Date.now() - 3 * 3600_000);
    const chat = await ChatConversation.create({ customerId: someone, title: "Where is my order?", status: "waiting-support" });
    await ChatConversation.collection.updateOne({ _id: chat._id }, { $set: { updatedAt: old } });
    await ChatConversation.create({ customerId: someone, title: "Thanks", status: "resolved" });
    await Complaint.create({ customerId: someone, orderId: new mongoose.Types.ObjectId(), type: "damaged-item", description: "Torn cover" });
    await ApprovalRequest.create({ kind: "price", targetId: someone, requesterId: someone, after: { pricePaise: 100 } });
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it("gives the owner every queue and an admin only the day-to-day ones", async () => {
    const owner = await loadQueues(rolesFor("super-admin"));
    const admin = await loadQueues(rolesFor("admin"));
    expect(owner.map((queue) => queue.key)).toEqual(expect.arrayContaining(["approvals", "refundOwed", "refunds"]));
    expect(admin.map((queue) => queue.key)).not.toEqual(expect.arrayContaining(["approvals"]));
    expect(admin.some((queue) => queue.key.startsWith("refund"))).toBe(false);
    expect(await loadQueues(rolesFor("delivery"))).toEqual([]);
  });

  it("points the button at the oldest item and marks it late", async () => {
    const [chats] = (await loadQueues(rolesFor("admin"))).filter((queue) => queue.key === "chats");
    expect(chats.count).toBe(1);
    expect(chats.late).toBe(true);
    expect(chats.actionHref).toMatch(/^\/admin\/support\/[a-f0-9]{24}$/);
    const [complaints] = (await loadQueues(rolesFor("admin"))).filter((queue) => queue.key === "complaints");
    expect(complaints.actionHref).toMatch(/^\/admin\/complaints\?view=[a-f0-9]{24}#complaint$/);
    expect(complaints.late).toBe(false);
  });

  it("counts for the menu only what each person may act on", async () => {
    const owner = await staffCounts({ id: String(someone), roles: rolesFor("super-admin") });
    expect(owner.counts).toMatchObject({ chats: 1, complaints: 1, approvals: 1, orders: 0, lowStock: 0 });
    expect(owner.needsYou).toBe(3);
    const admin = await staffCounts({ id: String(someone), roles: rolesFor("admin") });
    expect(admin.counts.approvals).toBeUndefined();
    expect(admin.needsYou).toBe(2);
    const rider = await staffCounts({ id: String(someone), roles: rolesFor("delivery") });
    expect(rider.counts).toEqual({ deliveries: 0 });
    expect(rider.needsYou).toBe(0);
  });
});
