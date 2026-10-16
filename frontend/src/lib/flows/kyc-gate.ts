import type { Kyc } from "@/lib/api/backend"

/** What the create/join gate shows to a signed-in, onboarded user. */
export type KycGateState = "open" | "in-review" | "declined" | "verify"

export function kycGateState(kyc: Kyc): KycGateState {
  if (kyc.approved) return "open"
  if (kyc.status === "In Review") return "in-review"
  // Kyc Expired: a past approval lapsed, so they verify again like after a decline.
  if (kyc.status === "Declined" || kyc.status === "Kyc Expired") return "declined"
  return "verify"
}
