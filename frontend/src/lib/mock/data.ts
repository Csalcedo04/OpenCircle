import type { Circle, Contribution, Member, Review, Round, RoundStatus } from "@/lib/domain/types"

/**
 * Demo data standing in for the backend until the payments service lands.
 * Mirrors the proposal's scenarios: A (successful round), B (missing payment),
 * C (risk prevention). Test funds only. COP uses assetScale 2.
 */

const COP = { assetCode: "COP", assetScale: 2 } as const
const cop = (whole: number) => (BigInt(whole) * 100n).toString()
const WALLET = "https://ilp.interledger-test.dev"

export const members: Member[] = [
  { id: "alice", name: "Alice Restrepo", walletAddress: `${WALLET}/alice`, memberSince: "2025-11-02", payments: { onTime: 22, late: 1, missed: 0 }, circlesCompleted: 3 },
  { id: "bob", name: "Bob Cárdenas", walletAddress: `${WALLET}/bob`, memberSince: "2026-03-14", payments: { onTime: 9, late: 2, missed: 1 }, circlesCompleted: 1 },
  { id: "charlie", name: "Charlie Mejía", walletAddress: `${WALLET}/charlie`, memberSince: "2025-08-21", payments: { onTime: 31, late: 0, missed: 0 }, circlesCompleted: 5 },
  { id: "diana", name: "Diana Ospina", walletAddress: `${WALLET}/diana`, memberSince: "2026-01-09", payments: { onTime: 14, late: 1, missed: 0 }, circlesCompleted: 2 },
  { id: "edward", name: "Edward Gómez", walletAddress: `${WALLET}/edward`, memberSince: "2026-06-30", payments: { onTime: 5, late: 0, missed: 0 }, circlesCompleted: 0 },
  { id: "valentina", name: "Valentina Ruiz", walletAddress: `${WALLET}/valentina`, memberSince: "2025-05-17", payments: { onTime: 40, late: 2, missed: 0 }, circlesCompleted: 6 },
  { id: "mateo", name: "Mateo Zapata", walletAddress: `${WALLET}/mateo`, memberSince: "2026-02-11", payments: { onTime: 12, late: 3, missed: 1 }, circlesCompleted: 1 },
  { id: "sofia", name: "Sofía Henao", walletAddress: `${WALLET}/sofia`, memberSince: "2025-10-04", payments: { onTime: 19, late: 0, missed: 0 }, circlesCompleted: 3 },
  { id: "juan", name: "Juan Pablo Vélez", walletAddress: `${WALLET}/juanpablo`, memberSince: "2026-09-01", payments: { onTime: 1, late: 0, missed: 0 }, circlesCompleted: 0 },
  { id: "camila", name: "Camila Arango", walletAddress: `${WALLET}/camila`, memberSince: "2025-12-12", payments: { onTime: 16, late: 1, missed: 0 }, circlesCompleted: 2 },
]

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

export const reviews: Review[] = [
  { id: "r1", authorId: "charlie", subjectId: "alice", circleId: "mercado-bello", rating: 5, comment: "Always paid the first day of the round. Would save with her again.", date: "2026-10-09" },
  { id: "r2", authorId: "diana", subjectId: "alice", circleId: "natillera-laureles", rating: 5, comment: "Muy cumplida y clara con todo el grupo.", date: "2026-10-10" },
  { id: "r3", authorId: "alice", subjectId: "bob", circleId: "natillera-laureles", rating: 3, comment: "Pagó, pero tarde dos veces. Hay que recordarle.", date: "2026-10-10" },
  { id: "r4", authorId: "valentina", subjectId: "bob", circleId: "parceros-envigado", rating: 4, comment: "Good member once his recurring payment was set up.", date: "2026-08-20" },
  { id: "r5", authorId: "sofia", subjectId: "charlie", circleId: "mercado-bello", rating: 5, comment: "Organizó la natillera del barrio por años. Confianza total.", date: "2026-09-26" },
  { id: "r6", authorId: "alice", subjectId: "charlie", circleId: "mercado-bello", rating: 5, comment: "Answers questions fast and pays on time.", date: "2026-10-09" },
  { id: "r7", authorId: "charlie", subjectId: "diana", circleId: "mercado-bello", rating: 5, comment: "Cumplida en cada ronda.", date: "2026-10-03" },
  { id: "r8", authorId: "mateo", subjectId: "valentina", circleId: "parceros-envigado", rating: 5, comment: "She explained how the pool works to the whole group.", date: "2026-09-21" },
  { id: "r9", authorId: "sofia", subjectId: "valentina", circleId: "parceros-envigado", rating: 4, comment: "Muy responsable.", date: "2026-09-22" },
  { id: "r10", authorId: "valentina", subjectId: "mateo", circleId: "parceros-envigado", rating: 3, comment: "Se le olvidó un pago y lo cubrió su colateral.", date: "2026-09-22" },
  { id: "r11", authorId: "camila", subjectId: "sofia", circleId: "parceros-envigado", rating: 5, comment: "Never late. Friendly with new members.", date: "2026-10-05" },
  { id: "r12", authorId: "sofia", subjectId: "camila", circleId: "parceros-envigado", rating: 4, comment: "Buena compañera de ahorro.", date: "2026-10-05" },
]
