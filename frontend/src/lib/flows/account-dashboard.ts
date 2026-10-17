import type { Dashboard, DashboardCircle, DashboardRound } from "@/lib/api/backend"
import { toBig } from "@/lib/domain/money"

/**
 * Pure views over the account dashboard read model. Nothing here decides a payment's state:
 * every status comes from the backend's records (COMPLETED only once the pool's incoming
 * payment is verified). These functions only pick what to show first.
 */

/** What the user should know or do next about one circle's contributions. */
export type NextActionKind =
  | "OVERDUE"
  | "FAILED"
  | "AUTHORIZATION_REQUIRED"
  | "DUE_TODAY"
  | "SCHEDULED"
  | "PROCESSING"
  | "UPCOMING"
  | "WAITING_FOR_MEMBERS"

export interface NextAction {
  kind: NextActionKind
  circle: DashboardCircle
  /** The round the action is about; null while the circle waits for members. */
  round: DashboardRound | null
  /** The user paid the round before this one in full (verified). */
  paidPrevious: boolean
}

// Lower is more urgent.
const URGENCY: Record<NextActionKind, number> = {
  OVERDUE: 0,
  FAILED: 1,
  AUTHORIZATION_REQUIRED: 2,
  DUE_TODAY: 3,
  SCHEDULED: 4,
  PROCESSING: 5,
  UPCOMING: 6,
  WAITING_FOR_MEMBERS: 7,
}

const DAY_MS = 86_400_000
// Dates are shown in UTC (formatDate), so "today" is the UTC day too.
const sameUtcDay = (a: string, b: string) => Math.floor(Date.parse(a) / DAY_MS) === Math.floor(Date.parse(b) / DAY_MS)

export const isAuthorized = (wallet: Dashboard["wallet"]): boolean => wallet?.authorization.status === "ACTIVE"

/** The next action for one circle, at circle time; null when there is nothing ahead. */
export function circleAction(circle: DashboardCircle, authorized: boolean): NextAction | null {
  if (circle.status === "OPEN") return { kind: "WAITING_FOR_MEMBERS", circle, round: null, paidPrevious: false }
  if (circle.status !== "ACTIVE") return null

  const rounds = [...circle.rounds].sort((a, b) => a.number - b.number)
  const paidBefore = (round: DashboardRound) => rounds.find((r) => r.number === round.number - 1)?.myStatus === "COMPLETED"
  const make = (kind: NextActionKind, round: DashboardRound): NextAction => ({ kind, circle, round, paidPrevious: paidBefore(round) })

  // A contribution still owed in a collecting round.
  const open = rounds.find((r) => r.state === "COLLECTING" && (r.myStatus === "PENDING" || r.myStatus === "PROCESSING"))
  if (open) {
    if (Date.parse(circle.now) > Date.parse(open.deadline)) return make("OVERDUE", open)
    if (open.myStatus === "PROCESSING") return make("PROCESSING", open)
    if (!authorized) return make("AUTHORIZATION_REQUIRED", open)
    return make(sameUtcDay(circle.now, open.deadline) ? "DUE_TODAY" : "SCHEDULED", open)
  }

  // The latest round the user was asked to pay failed: say so before anything upcoming.
  const latest = [...rounds].reverse().find((r) => r.myStatus !== null)
  if (latest?.myStatus === "FAILED") return make("FAILED", latest)

  const upcoming = rounds.find((r) => r.state === "UPCOMING")
  if (upcoming) return make(authorized ? "UPCOMING" : "AUTHORIZATION_REQUIRED", upcoming)
  return null
}

/** The most urgent action across circles; ties go to the earliest deadline. */
export function nextAction(dashboard: Pick<Dashboard, "circles" | "wallet">): NextAction | null {
  const authorized = isAuthorized(dashboard.wallet)
  const actions = dashboard.circles.map((c) => circleAction(c, authorized)).filter((a): a is NextAction => a !== null)
  const deadline = (a: NextAction) => (a.round ? Date.parse(a.round.deadline) : Number.POSITIVE_INFINITY)
  actions.sort((a, b) => URGENCY[a.kind] - URGENCY[b.kind] || deadline(a) - deadline(b))
  return actions[0] ?? null
}

/** Kinds that point at a contribution the user still owes. */
export const OWED: readonly NextActionKind[] = ["OVERDUE", "AUTHORIZATION_REQUIRED", "DUE_TODAY", "SCHEDULED", "PROCESSING", "UPCOMING"]

/** The next contribution the user owes (any circle), earliest deadline first. */
export function upcomingPayment(dashboard: Pick<Dashboard, "circles" | "wallet">): NextAction | null {
  const authorized = isAuthorized(dashboard.wallet)
  const owed = dashboard.circles
    .map((c) => circleAction(c, authorized))
    .filter((a): a is NextAction & { round: DashboardRound } => a !== null && a.round !== null && OWED.includes(a.kind))
  owed.sort((a, b) => Date.parse(a.round.deadline) - Date.parse(b.round.deadline))
  return owed[0] ?? null
}

export interface PayoutView {
  circle: DashboardCircle
  /** The user's payout round; null while the circle is OPEN (position is provisional). */
  round: DashboardRound | null
}

/** Rounds whose payout is behind the user: paid out or refunded. */
const PAYOUT_DONE: readonly DashboardRound["state"][] = ["PAID_OUT", "REFUNDED"]

/** The user's next payout among active circles, by its round's deadline. */
export function nextPayout(circles: readonly DashboardCircle[]): PayoutView | null {
  const ahead = circles
    .filter((c) => c.status === "ACTIVE")
    .map((c) => ({ circle: c, round: c.rounds.find((r) => r.mine) ?? null }))
    .filter((p): p is PayoutView & { round: DashboardRound } => p.round !== null && !PAYOUT_DONE.includes(p.round.state))
  ahead.sort((a, b) => Date.parse(a.round.deadline) - Date.parse(b.round.deadline))
  return ahead[0] ?? null
}

export interface FundingView {
  circle: DashboardCircle
  round: DashboardRound
  /** Verified contributions × contribution. */
  collected: bigint
  /** Contribution × seats: what a fully funded round holds. */
  target: bigint
}

/** Funding of each active circle's earliest open round (collecting, or closed but not paid out). */
export function roundFunding(circles: readonly DashboardCircle[]): FundingView[] {
  return circles.flatMap((circle) => {
    if (circle.status !== "ACTIVE") return []
    const round =
      circle.rounds.find((r) => r.number === circle.currentRound) ?? circle.rounds.find((r) => r.state === "COLLECTING")
    if (!round) return []
    const each = toBig(circle.contribution)
    return [{ circle, round, collected: each * BigInt(round.verified), target: each * BigInt(circle.size) }]
  })
}

/** Payment reliability: on-time share of contributions that came due (0–100), null with none yet. */
export function reliability(record: Dashboard["record"]): number | null {
  const { onTime, late, missed } = record.payments
  const due = onTime + late + missed
  return due === 0 ? null : Math.floor((onTime * 100) / due)
}
