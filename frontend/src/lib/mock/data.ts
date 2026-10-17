import type {Circle, Contribution, Round, RoundStatus} from "@/lib/domain/types"

/**
 * Demo data standing in for the backend until the payments service lands.
 * Mirrors the proposal's scenarios: A (successful round), B (missing payment),
 * C (risk prevention). Test funds only. COP uses assetScale 2.
 */

const COP = { assetCode: "COP", assetScale: 2 } as const
const cop = (whole: number) => (BigInt(whole) * 100n).toString()
const WALLET = "https://ilp.interledger-test.dev"


function contributions(ids: string[], status: (id: string) => Contribution["status"]): Contribution[] {
  return ids.map((memberId) => ({ memberId, status: status(memberId) }))
}

function rounds(order: string[], start: string, lengthDays: number, statusOf: (n: number) => RoundStatus, contribOf: (n: number) => (id: string) => Contribution["status"]): Round[] {
  const startMs = Date.parse(start)
  return order.map((beneficiaryId, i) => {
    const number = i + 1
    return {
      number,
      beneficiaryId,
      status: statusOf(number),
      deadline: new Date(startMs + number * lengthDays * 86_400_000).toISOString(),
      contributions: contributions(order, contribOf(number)),
    }
  })
}

// Scenario C — fully funded round 2, Bob has 60,000 owed and only 20,000 collateral.
const laurelesOrder = ["alice", "bob", "charlie", "diana", "edward"]
const laureles: Circle = {
  id: "natillera-laureles",
  name: "Natillera Laureles",
  city: "Medellín",
  status: "ACTIVE",
  contribution: { value: cop(20_000), ...COP },
  feeBps: 200,
  thresholdValue: cop(20_000),
  grantWeightBps: 5_000,
  roundLengthDays: 7,
  poolWalletAddress: `${WALLET}/pool-laureles`,
  size: 5,
  currentRound: 2,
  seats: [
    { memberId: "alice", payoutRound: 1, collateralValue: cop(20_000), grant: "RECURRING" },
    { memberId: "bob", payoutRound: 2, collateralValue: cop(20_000), grant: null },
    { memberId: "charlie", payoutRound: 3, collateralValue: cop(0), grant: "RECURRING" },
    { memberId: "diana", payoutRound: 4, collateralValue: cop(0), grant: "RECURRING" },
    { memberId: "edward", payoutRound: 5, collateralValue: cop(0), grant: "PER_ROUND" },
  ],
  rounds: rounds(
    laurelesOrder,
    "2026-10-02",
    7,
    (n) => (n === 1 ? "PAID_OUT" : n === 2 ? "BLOCKED" : "UPCOMING"),
    (n) => () => (n <= 2 ? "VERIFIED" : "PENDING"),
  ),
}

// Scenario B — four of five paid, round stays COLLECTING until the deadline.
const envigadoOrder = ["valentina", "mateo", "sofia", "camila", "juan"]
const envigado: Circle = {
  id: "parceros-envigado",
  name: "Parceros de Envigado",
  city: "Envigado",
  status: "ACTIVE",
  contribution: { value: cop(50_000), ...COP },
  feeBps: 200,
  thresholdValue: cop(50_000),
  grantWeightBps: 5_000,
  roundLengthDays: 14,
  poolWalletAddress: `${WALLET}/pool-envigado`,
  size: 5,
  currentRound: 3,
  seats: [
    { memberId: "valentina", payoutRound: 1, collateralValue: cop(50_000), grant: "RECURRING" },
    { memberId: "mateo", payoutRound: 2, collateralValue: cop(50_000), grant: "RECURRING" },
    { memberId: "sofia", payoutRound: 3, collateralValue: cop(50_000), grant: "RECURRING" },
    { memberId: "camila", payoutRound: 4, collateralValue: cop(0), grant: "RECURRING" },
    { memberId: "juan", payoutRound: 5, collateralValue: cop(0), grant: "PER_ROUND" },
  ],
  rounds: rounds(
    envigadoOrder,
    "2026-09-06",
    14,
    (n) => (n < 3 ? "PAID_OUT" : n === 3 ? "COLLECTING" : "UPCOMING"),
    (n) => (id) => (n < 3 ? "VERIFIED" : n === 3 ? (id === "mateo" ? "PENDING" : "VERIFIED") : "PENDING"),
  ),
}

// Scenario A — all five verified, engine approved, payout sent.
const belloOrder = ["charlie", "sofia", "diana", "valentina", "alice"]
const bello: Circle = {
  id: "mercado-bello",
  name: "Mercado de Bello",
  city: "Bello",
  status: "ACTIVE",
  contribution: { value: cop(20_000), ...COP },
  feeBps: 200,
  thresholdValue: cop(20_000),
  grantWeightBps: 5_000,
  roundLengthDays: 7,
  poolWalletAddress: `${WALLET}/pool-bello`,
  size: 5,
  currentRound: 4,
  seats: [
    { memberId: "charlie", payoutRound: 1, collateralValue: cop(20_000), grant: "RECURRING" },
    { memberId: "sofia", payoutRound: 2, collateralValue: cop(20_000), grant: "RECURRING" },
    { memberId: "diana", payoutRound: 3, collateralValue: cop(0), grant: "RECURRING" },
    { memberId: "valentina", payoutRound: 4, collateralValue: cop(0), grant: "RECURRING" },
    { memberId: "alice", payoutRound: 5, collateralValue: cop(0), grant: "RECURRING" },
  ],
  rounds: rounds(
    belloOrder,
    "2026-09-18",
    7,
    (n) => (n <= 4 ? "PAID_OUT" : "UPCOMING"),
    (n) => () => (n <= 4 ? "VERIFIED" : "PENDING"),
  ),
}

// Open for members — three of six seats taken.
const poblado: Circle = {
  id: "ahorro-poblado",
  name: "Ahorro El Poblado",
  city: "Medellín",
  status: "OPEN",
  contribution: { value: cop(100_000), ...COP },
  feeBps: 200,
  thresholdValue: cop(100_000),
  grantWeightBps: 5_000,
  roundLengthDays: 30,
  poolWalletAddress: `${WALLET}/pool-poblado`,
  size: 6,
  currentRound: 0,
  seats: [
    { memberId: "valentina", payoutRound: 2, collateralValue: cop(100_000), grant: "RECURRING" },
    { memberId: "charlie", payoutRound: 4, collateralValue: cop(0), grant: "RECURRING" },
    { memberId: "camila", payoutRound: 6, collateralValue: cop(0), grant: "RECURRING" },
  ],
  rounds: [],
}

export const circles: Circle[] = [laureles, envigado, bello, poblado]

