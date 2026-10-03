import mongoose from "mongoose";
import { getEnv } from "../env";
const globalDB = globalThis as typeof globalThis & {
  mongoPromise?: Promise<typeof mongoose>;
};
export async function connectDB() {
  if (!globalDB.mongoPromise)
    globalDB.mongoPromise = mongoose
      .connect(getEnv().MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
        maxPoolSize: 10,
        // a page asks for several things at once, and each new connection to Atlas is a full
        // secure handshake. The driver used to open them two at a time, only when a page
        // needed them, so the first busy page waited 10–15 s; now a few are opened at start
        // (src/instrumentation.ts), in parallel, before anyone visits.
        minPoolSize: 4,
        maxConnecting: 4,
      })
      .catch((error) => {
        globalDB.mongoPromise = undefined;
        throw error;
      });
  return globalDB.mongoPromise;
}
