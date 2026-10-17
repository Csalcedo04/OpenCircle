import { z } from "zod"
import type { Cadence, NewCircleRequest, SeatRequest } from "@/lib/api/backend"
import { parseWholeUnits } from "@/lib/domain/money"

// Create / join form logic, shared by the server actions. Pure, so it's unit-tested.

/** Circles are in the pot's currency: COP, 2 decimals (OpenCircle's test-network wallet). */
export const CIRCLE_ASSET_SCALE = 2
export const CADENCES = ["WEEKLY", "MONTHLY"] as const satisfies readonly Cadence[]
export const MIN_SIZE = 3
export const MAX_SIZE = 12
const MIN_CONTRIBUTION = 1_000n
const MAX_CONTRIBUTION = 10_000_000n

/** Message keys shared by both forms (dictionary section `circleErrors`). */
export type CircleErrorKey =
  | "name"
  | "city"
  | "amount"
  | "size"
  | "cadence"
  | "seat"
  | "collateral"
  | "seatTaken"
  | "alreadyMember"
  | "notOpen"
  | "kyc"
  | "unavailable"
  | "generic"

export type CircleField = "name" | "city" | "amount" | "size" | "cadence" | "seat" | "collateral"
export type FieldErrors = Partial<Record<CircleField, CircleErrorKey>>

/** Whole pesos ("20.000", "20000") → minor units, or null if not a whole amount. */
const wholeToMinor = (raw: string) => parseWholeUnits(raw.trim(), CIRCLE_ASSET_SCALE)
const pesos = (whole: bigint) => whole * 10n ** BigInt(CIRCLE_ASSET_SCALE)

export interface CreateFields {
  name: string
  city: string
  amount: string
  size: string
  cadence: string
  payoutRound: string
}

const createSchema = z.object({
  name: z.string().trim().min(3, "name").max(60, "name"),
  city: z.string().trim().min(2, "city").max(80, "city"),
  cadence: z.enum(CADENCES, "cadence"),
})

export function parseCreateForm(f: CreateFields): { ok: true; request: NewCircleRequest } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {}
  const base = createSchema.safeParse(f)
  if (!base.success) for (const issue of base.error.issues) errors[issue.path[0] as CircleField] ??= issue.path[0] as CircleErrorKey

  const contribution = wholeToMinor(f.amount)
  if (contribution === null || contribution < pesos(MIN_CONTRIBUTION) || contribution > pesos(MAX_CONTRIBUTION)) errors.amount = "amount"
  const size = Number(f.size)
  if (!Number.isInteger(size) || size < MIN_SIZE || size > MAX_SIZE) errors.size = "size"
  const payoutRound = Number(f.payoutRound)
  if (!Number.isInteger(payoutRound) || payoutRound < 1 || (!errors.size && payoutRound > size)) errors.seat = "seat"

  if (!base.success || Object.keys(errors).length > 0 || contribution === null) return { ok: false, errors }
  return {
    ok: true,
    request: {
      name: base.data.name,
      city: base.data.city,
      contributionValue: contribution.toString(),
      size,
      cadence: base.data.cadence,
      payoutRound,
    },
  }
}

export interface JoinFields {
  payoutRound: string
  collateral: string
  grantMode: string
}

export function parseJoinForm(
  f: JoinFields,
  circle: { size: number; assetScale: number },
): { ok: true; seat: SeatRequest } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {}
  const payoutRound = Number(f.payoutRound)
  if (!Number.isInteger(payoutRound) || payoutRound < 1 || payoutRound > circle.size) errors.seat = "seat"
  const collateral = f.collateral.trim() === "" ? 0n : parseWholeUnits(f.collateral.trim(), circle.assetScale)
  if (collateral === null) errors.collateral = "collateral"
  if (Object.keys(errors).length > 0 || collateral === null) return { ok: false, errors }
  const grantMode = f.grantMode === "RECURRING" || f.grantMode === "PER_ROUND" ? f.grantMode : null
  return { ok: true, seat: { payoutRound, collateralValue: collateral.toString(), grantMode } }
}

const apiErrors: Record<string, CircleErrorKey> = {
  SEAT_TAKEN: "seatTaken",
  ALREADY_MEMBER: "alreadyMember",
  CIRCLE_NOT_OPEN: "notOpen",
  INVALID_PAYOUT_ROUND: "seat",
  KYC_REQUIRED: "kyc",
  BACKEND_UNAVAILABLE: "unavailable",
}

/** API error code from creating or joining → message key. */
export const circleErrorKey = (code: string): CircleErrorKey => apiErrors[code] ?? "generic"
