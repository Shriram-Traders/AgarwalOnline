import "server-only";
import { cache } from "react";
import { connectDB } from "../db/connect";
import { ServiceArea } from "../db/models";
import { SlotPattern } from "../commerce/models";
import { deliveryRules } from "../commerce/service";
import { istDate } from "../commerce/delivery";
import { clock, windowLabel } from "../commerce/slots";
import { getEnv } from "../env";
import { taxProfile } from "../tax/profile";
import type { LegalFacts } from "./types";

/** The live values the policy pages quote: business details, delivery rules, areas and retention. Once per request. */
export const legalFacts = cache(async (): Promise<LegalFacts> => {
  await connectDB();
  const [profile, rules, areas] = await Promise.all([
    taxProfile(),
    deliveryRules(),
    ServiceArea.find({ enabled: true }).sort({ name: 1 }).select("name feePaise codEnabled codLimitPaise"),
  ]);
  const patterns = await SlotPattern.find({ areaId: { $in: areas.map((area) => area._id) }, enabled: true })
    .sort({ startMinutes: 1 })
    .lean<{ areaId: unknown; days: number[]; startMinutes: number; endMinutes: number }[]>();
  const env = getEnv();
  const today = istDate(new Date());
  return {
    business: {
      legalName: profile.legalName,
      address: profile.address,
      gstin: profile.gstin,
      phone: profile.phone,
      email: profile.email,
      grievanceName: profile.grievanceName,
      grievanceDesignation: profile.grievanceDesignation,
    },
    cutoff: clock(rules.cutoffHour * 60),
    freeThresholdPaise: rules.freeThresholdPaise,
    holidays: rules.holidays,
    blackoutDates: rules.blackoutDates.filter((date) => date >= today).sort(),
    areas: areas.map((area) => ({
      name: area.name as string,
      feePaise: area.feePaise as number,
      codEnabled: area.codEnabled as boolean,
      codLimitPaise: area.codLimitPaise as number,
      times: patterns
        .filter((pattern) => String(pattern.areaId) === String(area._id))
        .map((pattern) => ({ days: pattern.days, window: windowLabel(pattern.startMinutes, pattern.endMinutes) })),
    })),
    evidenceDays: env.EVIDENCE_RETENTION_DAYS,
    auditDays: env.AUDIT_RETENTION_DAYS,
  };
});
