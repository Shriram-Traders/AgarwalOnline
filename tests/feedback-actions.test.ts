import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// the rating form handlers on their own: the session, the language and the service are stand-ins
const mocks = vi.hoisted(() => ({
  locale: "en" as "en" | "mr",
  requirePermission: vi.fn(async () => ({ id: "665f00000000000000000001", roles: ["customer"] })),
  revalidatePath: vi.fn(),
  service: {
    submitFeedback: vi.fn(async () => ({ rating: 5, complaintType: undefined as string | undefined })),
    skipFeedback: vi.fn(),
    replyToFeedback: vi.fn(),
    markFeedbackRead: vi.fn(),
    markRestRead: vi.fn(async () => 3),
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("../src/lib/auth/session", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("../src/lib/i18n", () => ({ currentLocale: async () => mocks.locale }));
vi.mock("../src/lib/logger", () => ({ log: vi.fn() }));
vi.mock("../src/lib/feedback/service", () => mocks.service);

import {
  feedbackReadAction,
  replyFeedbackAction,
  skipFeedbackAction,
  submitFeedbackAction,
} from "../src/lib/feedback/actions";

const ORDER = "665f000000000000000000aa";
function form(fields: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields))
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, item);
  return data;
}

describe("Sending a rating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.locale = "en";
  });

  it("passes every picked tag, the language and an empty rider rating as none", async () => {
    const result = await submitFeedbackAction({}, form({ orderId: ORDER, rating: "5", tags: ["on-time", "well-packed"], comment: "Lovely" }));
    expect(result).toEqual({ success: "Your feedback reached the shop.", complaintType: undefined });
    expect(mocks.service.submitFeedback).toHaveBeenCalledWith("665f00000000000000000001", {
      orderId: ORDER,
      rating: "5",
      tags: ["on-time", "well-packed"],
      riderRating: undefined,
      comment: "Lovely",
      locale: "en",
    });
    // the popup refreshes the page itself, after its thank-you has been read
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("hands back the complaint to offer after a low rating about an item", async () => {
    mocks.service.submitFeedback.mockResolvedValueOnce({ rating: 1, complaintType: "damaged-item" });
    expect(await submitFeedbackAction({}, form({ orderId: ORDER, rating: "1", tags: ["damaged-item"] }))).toMatchObject({
      complaintType: "damaged-item",
    });
  });

  it.each([
    ["FEEDBACK_ALREADY", "You’ve already rated this order.", "तुम्ही या ऑर्डरला आधीच रेटिंग दिले आहे."],
    ["FEEDBACK_NOT_DELIVERED", "You can rate an order once it’s delivered.", "ऑर्डर पोहोचल्यानंतर रेटिंग देता येईल."],
    ["FEEDBACK_TOO_LATE", "This order is too old to rate now.", "या ऑर्डरला रेटिंग देण्याची मुदत संपली."],
    ["FEEDBACK_NOT_FOUND", "We couldn’t find that order.", "ही ऑर्डर सापडली नाही."],
    ["UNAUTHENTICATED", "Please sign in again to continue.", "पुढे जाण्यासाठी पुन्हा साइन इन करा."],
    ["Too many attempts. Please try again later.", "Too many tries. Please try again in a little while.", "खूप वेळा प्रयत्न झाला. थोड्या वेळाने पुन्हा करा."],
    ["connection reset", "Couldn’t send your rating. Please try again.", "रेटिंग पाठवता आले नाही. पुन्हा प्रयत्न करा."],
  ])("says %s plainly in English and Marathi", async (code, english, marathi) => {
    mocks.service.submitFeedback.mockRejectedValue(new Error(code));
    expect(await submitFeedbackAction({}, form({ orderId: ORDER, rating: "4" }))).toEqual({ error: english });
    mocks.locale = "mr";
    expect(await submitFeedbackAction({}, form({ orderId: ORDER, rating: "4" }))).toEqual({ error: marathi });
  });

  it("names the field for a bad value in English, and keeps Marathi to a plain line", async () => {
    const invalid = z.object({ rating: z.number().int().min(1) }).safeParse({ rating: 0 }).error!;
    mocks.service.submitFeedback.mockRejectedValue(invalid);
    const english = await submitFeedbackAction({}, form({ orderId: ORDER, rating: "0" }));
    expect(english.error).toMatch(/^Rating/);
    mocks.locale = "mr";
    expect(await submitFeedbackAction({}, form({ orderId: ORDER, rating: "0" }))).toEqual({
      error: "रेटिंग पाठवता आले नाही. पुन्हा प्रयत्न करा.",
    });
  });

  it("remembers a Not now without a message", async () => {
    expect(await skipFeedbackAction({}, form({ orderId: ORDER }))).toEqual({});
    expect(mocks.service.skipFeedback).toHaveBeenCalledWith("665f00000000000000000001", { orderId: ORDER });
  });
});

describe("The owner's reply and read marks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends a reply and refreshes the reading page and the overview", async () => {
    const result = await replyFeedbackAction({}, form({ feedbackId: ORDER, reply: "Sorry about the delay." }));
    expect(result.success).toContain("Reply sent");
    expect(mocks.requirePermission).toHaveBeenCalledWith("settings:write");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/super-admin/feedback");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin");
  });

  it("says so when a rating already has its one reply", async () => {
    mocks.service.replyToFeedback.mockRejectedValueOnce(new Error("FEEDBACK_REPLIED"));
    expect(await replyFeedbackAction({}, form({ feedbackId: ORDER, reply: "Second thoughts" }))).toEqual({
      error: "This rating already has a reply.",
    });
  });

  it("marks one as read or unread, or the rest in one go", async () => {
    await feedbackReadAction({}, form({ feedbackId: ORDER, intent: "read" }));
    expect(mocks.service.markFeedbackRead).toHaveBeenLastCalledWith("665f00000000000000000001", { feedbackId: ORDER, read: true });
    await feedbackReadAction({}, form({ feedbackId: ORDER, intent: "unread" }));
    expect(mocks.service.markFeedbackRead).toHaveBeenLastCalledWith("665f00000000000000000001", { feedbackId: ORDER, read: false });
    expect(await feedbackReadAction({}, form({ intent: "rest" }))).toEqual({ success: "3 ratings marked as read." });
    expect((await feedbackReadAction({}, form({ intent: "delete" }))).error).toBeTruthy();
  });

  it("refuses someone who may not read ratings", async () => {
    mocks.requirePermission.mockRejectedValueOnce(new Error("FORBIDDEN"));
    expect(await replyFeedbackAction({}, form({ feedbackId: ORDER, reply: "Hello there" }))).toEqual({
      error: "Your account can’t do this.",
    });
    expect(mocks.service.replyToFeedback).not.toHaveBeenCalled();
  });
});
