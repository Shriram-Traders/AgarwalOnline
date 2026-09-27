// One-time: accounts made with Google have no phone, so `phone` stays unique only when present.
// The old index was unique on every document, which lets just one phone-less account exist.
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
await connectDB();
const users = mongoose.connection.collection("users");
// a brand-new database has no users collection yet, which is fine: the index is simply created
const indexes = await users.indexes().catch(() => []);
const old = indexes.find((i) => i.name === "phone_1");
if (old?.partialFilterExpression) {
  console.log(`Database "${mongoose.connection.name}": phone index already allows missing numbers.`);
} else {
  if (old) await users.dropIndex("phone_1");
  await users.createIndex(
    { phone: 1 },
    { name: "phone_1", unique: true, partialFilterExpression: { phone: { $type: "string" } } },
  );
  console.log(`Database "${mongoose.connection.name}": phone index now unique only when a number is set.`);
}
await mongoose.disconnect();
