import { describe, expect, it } from "vitest"
import { circles } from "@/lib/mock/data"
import {
  collectedFor,
  currentRound,
  evaluateCoverage,
  feeFor,
  payoutFor,
  poolBalance,
  potFor,
  verifiedCount,
} from "./rounds"
import type { Circle, GrantMode } from "./types"

const cop = (whole: number) => (BigInt(whole) * 100n).toString()

/** The proposal's five-person circle: 20,000 COP, 2% fee, one-contribution gap, grants at 50%. */
const fivePerson: Circle = {
  id: "proposal",
  name: "Proposal circle",
  city: "Medellín",
  status: "ACTIVE",
  contribution: { value: cop(20_000), assetCode: "COP", assetScale: 2 },
  feeBps: 200,
  thresholdValue: cop(20_000),
  grantWeightBps: 5_000,
  roundLengthDays: 7,
  poolWalletAddress: "https://ilp.interledger-test.dev/pool",
  size: 5,
  seats: [],
  rounds: [],
  currentRound: 1,
}

describe("pot, fee and payout", () => {
  it("collects 100,000, keeps 2,000 and pays out 98,000", () => {
    expect(potFor(fivePerson)).toBe(BigInt(cop(100_000)))
    expect(feeFor(fivePerson)).toBe(BigInt(cop(2_000)))
    expect(payoutFor(fivePerson)).toBe(BigInt(cop(98_000)))
  })

  it("fee + payout always equals the pot", () => {
    const odd = { ...fivePerson, contribution: { ...fivePerson.contribution, value: "33333" }, size: 7 }
    expect(feeFor(odd) + payoutFor(odd)).toBe(potFor(odd))
  })
})

describe("Safe Round Engine (proposal table)", () => {
  const cases: Array<{ name: string; round: number; collateral: number; grant: GrantMode | null; uncovered: number; eligible: boolean }> = [
    { name: "Bob, round 2, collateral only", round: 2, collateral: 20_000, grant: null, uncovered: 40_000, eligible: false },
    { name: "Bob, round 2, collateral + grant", round: 2, collateral: 20_000, grant: "RECURRING", uncovered: 10_000, eligible: true },
    { name: "Alice, round 1, grant only", round: 1, collateral: 0, grant: "RECURRING", uncovered: 40_000, eligible: false },
    { name: "Alice, round 1, collateral + grant", round: 1, collateral: 20_000, grant: "RECURRING", uncovered: 20_000, eligible: true },
    { name: "Edward, round 5", round: 5, collateral: 0, grant: null, uncovered: 0, eligible: true },
  ]

  it.each(cases)("$name → uncovered $uncovered, eligible $eligible", ({ round, collateral, grant, uncovered, eligible }) => {
    const decision = evaluateCoverage(fivePerson, { payoutRound: round, collateralValue: cop(collateral), grant })
    expect(decision.uncovered).toBe(BigInt(cop(uncovered)))
    expect(decision.eligible).toBe(eligible)
  })

  it("a per-round approval does not count as coverage", () => {
    const decision = evaluateCoverage(fivePerson, { payoutRound: 2, collateralValue: cop(20_000), grant: "PER_ROUND" })
    expect(decision.grantCoverage).toBe(0n)
    expect(decision.eligible).toBe(false)
  })

  it("never reports negative uncovered exposure", () => {
    const decision = evaluateCoverage(fivePerson, { payoutRound: 4, collateralValue: cop(500_000), grant: "RECURRING" })
    expect(decision.uncovered).toBe(0n)
  })
})

describe("demo circles match the proposal scenarios", () => {
  const byId = (id: string) => {
    const c = circles.find((x) => x.id === id)
    if (!c) throw new Error(`missing demo circle ${id}`)
    return c
  }

  it("A: Mercado de Bello paid out with 5/5 verified", () => {
    const c = byId("mercado-bello")
    const round = currentRound(c)
    expect(round?.status).toBe("PAID_OUT")
    expect(round && verifiedCount(round)).toBe(5)
  })

  it("B: Parceros de Envigado holds 4/5 and keeps collecting", () => {
    const c = byId("parceros-envigado")
    const round = currentRound(c)
    expect(round?.status).toBe("COLLECTING")
    expect(round && collectedFor(c, round)).toBe(BigInt(cop(200_000)))
  })

  it("C: Natillera Laureles is held for Bob, and the engine agrees", () => {
    const c = byId("natillera-laureles")
    const round = currentRound(c)
    const bob = c.seats.find((s) => s.memberId === round?.beneficiaryId)
    expect(round?.status).toBe("BLOCKED")
    expect(bob && evaluateCoverage(c, bob).eligible).toBe(false)
    expect(poolBalance(c)).toEqual({
      total: BigInt(cop(142_000)),
      round: BigInt(cop(100_000)),
      collateral: BigInt(cop(40_000)),
      fees: BigInt(cop(2_000)),
    })
  })
})
