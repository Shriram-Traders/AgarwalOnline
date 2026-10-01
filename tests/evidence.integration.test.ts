import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
// the route imports the session helper, which is marked server-only; this test is the server
vi.mock("server-only", () => ({}));
import { unlink } from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import { Category, Product, User } from "../src/lib/db/models";
import { UploadedEvidence } from "../src/lib/evidence/models";
import { storeEvidence } from "../src/lib/evidence/service";
import { runRetention } from "../src/lib/retention";
import { GET } from "../src/app/api/evidence/[id]/route";

const uri = process.env.TEST_MONGODB_URI;
// a 1×1 PNG: enough for the upload path, which checks type and size, not pixels
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
  "base64",
);
describe.skipIf(!uri)("Product photos", () => {
  let admin: string, productId: string;
  const written: string[] = [];
  beforeAll(async () => {
    if (!uri?.includes("/ags_test")) throw Error("Isolated DB required");
    Object.assign(process.env, {
      MONGODB_URI: uri,
      APP_ORIGIN: "http://127.0.0.1:3000",
      AUTH_SECRET: "test-secret-".repeat(4),
    });
    // exercise the local storage path, whatever the machine's own .env holds
    for (const key of ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"])
      delete process.env[key];
    await connectDB();
    for (const m of [User, Category, Product, UploadedEvidence]) await m.init();
  });
  beforeEach(async () => {
    for (const m of Object.values(mongoose.models)) await m.deleteMany({});
    admin = String(
      (await User.create({ name: "Staff", phone: "9000000081", roles: ["customer", "admin"] }))._id,
    );
    const category = await Category.create({ slug: "paper", name: { en: "Paper", mr: "कागद" } });
    productId = String(
      (
        await Product.create({
          slug: "notebook",
          name: { en: "Notebook", mr: "वही" },
          description: { en: "Notebook", mr: "वही" },
          categoryId: category._id,
          categorySlug: "paper",
          status: "published",
        })
      )._id,
    );
  });
  afterAll(async () => {
    for (const key of written)
      await unlink(path.join(process.cwd(), ".local", "uploads", key)).catch(() => undefined);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it("never gives a product photo an expiry date, and shows it to signed-out shoppers", async () => {
    const photo = await storeEvidence(admin, {
      file: new File([png], "notebook.png", { type: "image/png" }),
      purpose: "product",
      productId,
    });
    written.push(photo.storageKey);
    expect(photo.expiresAt).toBeUndefined();
    expect((await Product.findById(productId)).image).toBe(`/api/evidence/${photo._id}`);
    const response = await GET(new Request(`http://127.0.0.1:3000/api/evidence/${photo._id}`), {
      params: Promise.resolve({ id: String(photo._id) }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("public");
  });

  it("keeps product photos when the retention job deletes expired evidence", async () => {
    const past = new Date(Date.now() - 86400 * 1000);
    const common = {
      ownerId: admin,
      provider: "local",
      url: "/api/evidence/x",
      mime: "image/png",
      size: 10,
      sha256: "0".repeat(64),
      expiresAt: past,
    };
    // an older product upload still carrying a date, and a complaint photo past its 90 days
    await UploadedEvidence.create([
      { ...common, purpose: "product", productId, storageKey: "old-product.png" },
      { ...common, purpose: "complaint", storageKey: "old-complaint.png" },
    ]);
    await runRetention();
    expect(await UploadedEvidence.exists({ purpose: "product" })).toBeTruthy();
    expect(await UploadedEvidence.exists({ purpose: "complaint" })).toBeFalsy();
  });
});
