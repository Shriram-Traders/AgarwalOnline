import mongoose from "mongoose";
import { sendTabStatements } from "../src/lib/family/tab";
// run on the 1st of each month (India time) where Vercel Cron is not available
console.log(JSON.stringify({ sent: await sendTabStatements() }));
await mongoose.disconnect();
