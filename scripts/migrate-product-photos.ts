// One-time: product photos uploaded before 29 September 2026 were given an evidence expiry date,
// so the daily retention job would have deleted them. Product photos never expire now; this clears the old dates.
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import { UploadedEvidence } from "../src/lib/evidence/models";
await connectDB();
const result = await UploadedEvidence.updateMany(
  { purpose: "product", expiresAt: { $exists: true } },
  { $unset: { expiresAt: 1 } },
);
console.log(
  `Database "${mongoose.connection.name}": ${result.modifiedCount} product photo(s) will no longer expire.`,
);
await mongoose.disconnect();
