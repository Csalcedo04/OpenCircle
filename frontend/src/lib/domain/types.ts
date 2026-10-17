/**
 * Domain types shared by the UI. Amounts follow the project invariants:
 * `value` is an integer string in the asset's minor unit, always paired with
 * `assetCode` and `assetScale`. Never convert to `number` for arithmetic.
 */

export type Amount = {
  value: string
  assetCode: string
  assetScale: number
}

/** Round lifecycle from the OpenCircle proposal (pool model). */
export type RoundState =
  | "COLLECTING"
  | "FUNDED"
  | "RISK_CHECK"
  | "BLOCKED"
  | "PAYING_OUT"
  | "PAID_OUT"
  | "REFUNDED"

/** A future round has not opened yet; it has no state in the engine. */
export type RoundStatus = RoundState | "UPCOMING"

export type ContributionStatus = "VERIFIED" | "PENDING" | "MISSING" | "REFUNDED"

export type CircleStatus = "OPEN" | "ACTIVE" | "COMPLETED"

export type GrantMode = "RECURRING" | "PER_ROUND"

export type Member = {
  id: string
  /** "Ana G." from the API; never the full legal name. */
  name: string
  /** Only on the member's own profile page; seats in a circle don't carry it. */
  walletAddress: string | null
  /** First circle joined; null if they never joined one. ISO timestamp. */
  memberSince: string | null
  payments: { onTime: number; late: number; missed: number }
  /** Ratings received across all circles (average ×10, e.g. 46 = 4.6 stars). */
  ratings: { count: number; tenths: number }
  circlesCompleted: number
}

export type Contribution = {
  memberId: string
  status: ContributionStatus
}

export type Round = {
  number: number
  beneficiaryId: string
  status: RoundStatus
  deadline: string // ISO date
  contributions: Contribution[]
}

export type Seat = {
  memberId: string
  displayName?: string | undefined
  payoutRound: number
  /** Collateral held in the pool, minor units of the circle's asset. */
  collateralValue: string
  grant: GrantMode | null
}

export type Circle = {
  id: string
  name: string
  city: string
  status: CircleStatus
  contribution: Amount
  feeBps: number
  /** Max uncovered exposure before the Safe Round Engine blocks a payout. */
  thresholdValue: string
  /** Weight of an active recurring grant as coverage, in basis points. */
  grantWeightBps: number
  roundLengthDays: number
  poolWalletAddress: string
  size: number
  seats: Seat[]
  rounds: Round[]
  currentRound: number
  visibility?: "PRIVATE" | "PUBLIC" | undefined
  cadence?: "WEEKLY" | "MONTHLY" | undefined
}

export type Review = {
  id: string
  authorId: string
  authorName: string
  subjectId: string
  circleId: string
  circleName: string
  rating: 1 | 2 | 3 | 4 | 5
  comment: string
  date: string // ISO date
}
