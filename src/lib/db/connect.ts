import mongoose from "mongoose";
import { getEnv } from "../env";
import { log } from "../logger";
type MongoClient = InstanceType<typeof mongoose.mongo.MongoClient>;
const globalDB = globalThis as typeof globalThis & {
  mongoPromise?: Promise<typeof mongoose>;
  mongoClients?: Map<string, MongoClient>;
};

/**
 * On Vercel a copy of the app that wakes from sleep is a new server start, and Mongoose re-creates
 * every collection and index at each start: about 160 commands for 52 models, beside the first
 * visitor's page, on a cluster allowed 100 commands a second. There they are built once per
 * deployment instead (`indexesOncePerDeploy`). `npm run dev`, the tests and the scripts have no
 * deployment id and keep Mongoose's way.
 */
const DEPLOY = process.env.VERCEL_DEPLOYMENT_ID;
if (DEPLOY) {
  mongoose.set("autoIndex", false);
  mongoose.set("autoCreate", false);
}

/**
 * The one MongoClient per server process and database address. Mongoose and better-auth share
 * it, so each copy of the app holds one pool to Atlas instead of two (the free cluster allows 500
 * connections in all, and every Vercel instance is a copy). It lives on globalThis so a dev
 * hot reload reuses it instead of leaking a new one.
 */
export function mongoClient(uri = getEnv().MONGODB_URI): MongoClient {
  globalDB.mongoClients ??= new Map();
  let client = globalDB.mongoClients.get(uri);
  if (!client) {
    // Mongoose's own driver class: `setClient` only accepts that one
    client = new mongoose.mongo.MongoClient(uri, {
      serverSelectionTimeoutMS: 5000,
      // The driver's own default is to wait for ever: on Vercel a query sent down a connection that
      // died while the copy slept never came back, and the page stayed on its skeleton until a
      // refresh. There it now fails after 15 s (a read is then retried once on a fresh connection),
      // and a page waiting for a free connection gives up after 10 s and shows "Try again". Only a
      // query in flight is timed. Not elsewhere: a migration or an index build from a script may
      // rightly take minutes, and the test server shares a laptop database that other suites keep
      // dropping and rebuilding, which held its pages past 10 s (2026-11-17).
      ...(DEPLOY ? { connectTimeoutMS: 10_000, socketTimeoutMS: 15_000, waitQueueTimeoutMS: 10_000 } : {}),
      // 5, not 10: under a rush Vercel runs many copies, and at 10 each about 50 copies filled the free
      // cluster's 500 connections; then every page failed for ~5 minutes (load test 2026-10-24). A guest
      // page needs 0–3 queries and a signed-in one ~13 short ones, so 5 at a time is plenty per copy.
      maxPoolSize: 5,
      // each new connection to Atlas is a full secure handshake, so one is kept warm per server
      // (src/instrumentation.ts opens it at start); the rest open in parallel when a page needs
      // them and close after a minute idle, instead of four per server held open forever
      minPoolSize: 1,
      maxConnecting: 4,
      maxIdleTimeMS: 60_000,
    });
    globalDB.mongoClients.set(uri, client);
  }
  return client;
}

/**
 * better-auth keeps its sessions, accounts, codes and rate limits in collections of its own, not
 * Mongoose models, so nothing built their indexes: every signed-in page scanned all sessions to
 * find its own. Built whenever Mongoose's are; an index that exists costs one short command.
 */
function authIndexes(db: ReturnType<MongoClient["db"]>) {
  return Promise.all([
    // unique, as better-auth builds it too: asking for a plain one under the same name fails
    db.collection("authSessions").createIndex({ token: 1 }, { unique: true }),
    db.collection("authSessions").createIndex({ userId: 1 }),
    db.collection("authAccounts").createIndex({ userId: 1 }),
    db.collection("authAccounts").createIndex({ providerId: 1, accountId: 1 }),
    db.collection("authVerifications").createIndex({ identifier: 1 }),
    db.collection("authRateLimits").createIndex({ key: 1 }),
  ]);
}

/**
 * The first server start of a deployment builds every index and leaves a note in the database;
 * every later start reads the note (one command) and builds nothing. A build that failed leaves no
 * note, so the next start tries again.
 */
async function indexesOncePerDeploy(db: ReturnType<MongoClient["db"]>, deploy: string) {
  const notes = db.collection<{ _id: string; deploy: string; at: Date }>("appNotes");
  if ((await notes.findOne({ _id: "indexes" }))?.deploy === deploy) return;
  const { buildIndexes } = await import("./indexes");
  const failed = await buildIndexes();
  await authIndexes(db);
  log(failed.length ? "warn" : "info", "db.indexes-built", { deploy, failed });
  if (!failed.length) await notes.updateOne({ _id: "indexes" }, { $set: { deploy, at: new Date() } }, { upsert: true });
}

export async function connectDB() {
  if (!globalDB.mongoPromise)
    globalDB.mongoPromise = (async () => {
      // a test or script that connected Mongoose its own way keeps that connection
      if (mongoose.connection.readyState !== mongoose.ConnectionStates.disconnected) return mongoose;
      const client = mongoClient();
      await client.connect();
      mongoose.connection.setClient(client);
      void (DEPLOY ? indexesOncePerDeploy(client.db(), DEPLOY) : authIndexes(client.db())).catch((error) =>
        log("warn", "db.indexes-failed", { error }),
      );
      return mongoose;
    })().catch((error) => {
      globalDB.mongoPromise = undefined;
      throw error;
    });
  return globalDB.mongoPromise;
}
