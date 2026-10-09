import mongoose from "mongoose";
import { getEnv } from "../env";
type MongoClient = InstanceType<typeof mongoose.mongo.MongoClient>;
const globalDB = globalThis as typeof globalThis & {
  mongoPromise?: Promise<typeof mongoose>;
  mongoClients?: Map<string, MongoClient>;
};

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
      maxPoolSize: 10,
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

export async function connectDB() {
  if (!globalDB.mongoPromise)
    globalDB.mongoPromise = (async () => {
      // a test or script that connected Mongoose its own way keeps that connection
      if (mongoose.connection.readyState !== mongoose.ConnectionStates.disconnected) return mongoose;
      const client = mongoClient();
      await client.connect();
      mongoose.connection.setClient(client);
      return mongoose;
    })().catch((error) => {
      globalDB.mongoPromise = undefined;
      throw error;
    });
  return globalDB.mongoPromise;
}
