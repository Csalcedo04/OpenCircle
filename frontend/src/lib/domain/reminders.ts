import type { Contribution, Round } from "./types"

export type ReminderStatus = "DUE_SOON" | "DUE_TODAY" | "OVERDUE"

const HOUR = 60 * 60 * 1000

/**
 * Pure: whether to remind one member about their own contribution to the round being collected.
 * Only an unpaid (PENDING) contribution is reminded: within 72h, within 24h, or past the deadline.
 */
export function roundReminderStatus(
  round: Pick<Round, "status" | "deadline">,
  contribution: Pick<Contribution, "status"> | undefined,
  asOf: Date = new Date(),
): ReminderStatus | null {
  if (round.status !== "COLLECTING" || contribution?.status !== "PENDING") return null
  const deadline = Date.parse(round.deadline)
  if (Number.isNaN(deadline)) return null
  const hoursLeft = (deadline - asOf.getTime()) / HOUR
  if (hoursLeft < 0) return "OVERDUE"
  if (hoursLeft <= 24) return "DUE_TODAY"
  if (hoursLeft <= 72) return "DUE_SOON"
  return null
}
