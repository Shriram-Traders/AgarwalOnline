import { User } from "@/lib/db/models";
import { notify } from "@/lib/engagement/service";
import { PushDevice } from "@/lib/push/models";
import { log } from "@/lib/logger";
import { CartLine } from "./models";

/*
 * One reminder about items left in the basket: a notification (the bell, and their phone or PC) a few
 * hours after a signed-in shopper last changed their basket, only if they turned notifications on and
 * haven't switched reminders off in Edit profile. Once per basket: changing it again allows one more.
 * Run every hour from the cron; quiet at night.
 */

const HOUR = 3600_000;
/** Left alone this long before a reminder. */
const AFTER = 3 * HOUR;
/** Older than this, a basket is forgotten for good: no reminder days later. */
const UNTIL = 48 * HOUR;

/** Whether it's daytime in India (9 am to 9 pm): nobody gets buzzed about a basket at night. */
export const daytimeInIndia = (at: Date) => {
  const hour = new Date(at.getTime() + 330 * 60_000).getUTCHours();
  return hour >= 9 && hour < 21;
};

export async function sendBasketReminders(now = new Date()) {
  if (!daytimeInIndia(now)) return { sent: 0 };
  const baskets = await CartLine.aggregate<{ _id: unknown; last: Date; items: number }>([
    { $group: { _id: "$customerId", last: { $max: "$updatedAt" }, items: { $sum: 1 } } },
    { $match: { last: { $gte: new Date(now.getTime() - UNTIL), $lte: new Date(now.getTime() - AFTER) } } },
  ]);
  if (!baskets.length) return { sent: 0 };
  const ids = baskets.map((basket) => basket._id);
  const [withPush, willing] = await Promise.all([
    PushDevice.distinct("userId", { userId: { $in: ids } }),
    User.find({ _id: { $in: ids }, active: true, basketReminders: { $ne: false } }).distinct("_id"),
  ]);
  const reachable = new Set(withPush.map(String));
  const allowed = new Set(willing.map(String));
  let sent = 0;
  for (const basket of baskets) {
    const id = String(basket._id);
    if (!reachable.has(id) || !allowed.has(id)) continue;
    // marked first, and only if not reminded since this basket last changed: two runs never send twice
    const claimed = await User.updateOne(
      { _id: basket._id, $or: [{ basketRemindedAt: null }, { basketRemindedAt: { $lt: basket.last } }] },
      { $set: { basketRemindedAt: now } },
    );
    if (!claimed.modifiedCount) continue;
    try {
      await notify({
        userId: basket._id,
        type: "basket",
        title: "Your basket is waiting",
        body: `${basket.items} item${basket.items === 1 ? " you picked is" : "s you picked are"} still in your basket.`,
        href: "/cart",
      });
      sent += 1;
    } catch (error) {
      log("warn", "basket-reminder.failed", { error, userId: id });
    }
  }
  return { sent };
}
