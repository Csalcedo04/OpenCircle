import type { Kyc } from "@/lib/api/backend"

/** What the create/join gate shows to a signed-in, onboarded user. */
export type KycGateState = "open" | "checking" | "in-review" | "declined" | "verify"

export function kycGateState(kyc: Kyc): KycGateState {
  if (kyc.approved) return "open"
  if (kyc.status === "In Review") return "in-review"
  // Just back from Didit, or left mid-flow: wait for the result but let them resume.
  if (kyc.status === "In Progress" || kyc.status === "Resubmitted") return "checking"
  // Kyc Expired: a past approval lapsed, so they verify again like after a decline.
  if (kyc.status === "Declined" || kyc.status === "Kyc Expired") return "declined"
  return "verify"
}

// Didit is still deciding: the gate re-reads the status (the API pulls Didit's decision) until it settles.
const PENDING_STATUSES: readonly (string | null)[] = ["In Progress", "In Review", "Resubmitted"]

export function isKycPending(kyc: Kyc): boolean {
  return !kyc.approved && PENDING_STATUSES.includes(kyc.status)
}
