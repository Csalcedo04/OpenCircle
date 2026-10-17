import type { Round } from "./types"

export type ReminderStatus = "DUE_SOON" | "DUE_TODAY" | "OVERDUE"

/**
 * Pure evaluation of contribution reminder status for a round.
 */
export function roundReminderStatus(
  round: Pick<Round, "status" | "deadline" | "contributions">,
  asOf: Date = new Date(),
): ReminderStatus | null {
  if (round.status !== "COLLECTING" || !round.deadline) return null
  const hasPending = round.contributions.some((c) => c.status === "PENDING")
  if (!hasPending) return null

  const deadlineMs = Date.parse(round.deadline)
  if (Number.isNaN(deadlineMs)) return null

  const diffMs = deadlineMs - asOf.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)

  if (diffHours < 0) return "OVERDUE"
  if (diffHours <= 24) return "DUE_TODAY"
  if (diffHours <= 72) return "DUE_SOON"
  return null
}
