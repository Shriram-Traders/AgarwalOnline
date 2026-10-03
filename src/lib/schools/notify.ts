import { User } from "../db/models";
import { notify } from "../engagement/service";
import { log } from "../logger";
import { SchoolMember } from "./models";

type Message = { title: string; body: string; href?: string };

/**
 * Notifications go out after the change is saved and never undo it: a failed one is logged.
 * These helpers swallow their own errors for that reason.
 */
export async function notifyOwners(message: Message) {
  try {
    const owners = await User.find({ roles: "super-admin", active: true }).select("_id");
    await Promise.all(owners.map((owner) => notify({ userId: owner._id, type: "system", ...message })));
  } catch (error) {
    log("warn", "school.notify-owners-failed", { error });
  }
}

export async function notifyRepresentatives(schoolId: unknown, message: Message, exceptUserId?: string) {
  try {
    const members = await SchoolMember.find({ schoolId }).select("userId");
    await Promise.all(
      members
        .filter((member) => String(member.userId) !== exceptUserId)
        .map((member) => notify({ userId: member.userId, type: "system", ...message })),
    );
  } catch (error) {
    log("warn", "school.notify-representatives-failed", { error });
  }
}

export async function notifyPerson(userId: unknown, message: Message) {
  try {
    await notify({ userId, type: "system", ...message });
  } catch (error) {
    log("warn", "school.notify-failed", { error });
  }
}
