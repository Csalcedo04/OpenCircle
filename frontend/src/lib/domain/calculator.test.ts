import { describe, expect, it } from "vitest"
import { CALC_LIMITS, clampParticipants, estimateCircle, parseContribution } from "./calculator"

describe("estimateCircle", () => {
  it("matches the brief's default example: 5 × 20,000 at 2%", () => {
    expect(estimateCircle(5, 20_000n, 200)).toEqual({ total: 100_000n, fee: 2_000n, payout: 98_000n })
  })

  it("fee + payout always equals the total", () => {
    for (const [n, c, bps] of [[3, 33_333n, 250], [20, 9_999_999n, 175], [7, 1_001n, 1_000]] as const) {
      const { total, fee, payout } = estimateCircle(n, c, bps)
      expect(fee + payout).toBe(total)
    }
  })

  it("stays exact at the largest allowed circle", () => {
    expect(estimateCircle(20, CALC_LIMITS.maxContribution, 200).payout).toBe(196_000_000n)
  })

  it("rejects fractional participants and out-of-range fees", () => {
    expect(() => estimateCircle(2.5, 1_000n, 200)).toThrow(RangeError)
    expect(() => estimateCircle(5, 1_000n, 10_001)).toThrow(RangeError)
  })
})

describe("parseContribution", () => {
  it.each([
    ["20000", 20_000n],
    ["20.000", 20_000n],
    ["$ 20.000", 20_000n],
    ["1,000", 1_000n],
    ["10000000", 10_000_000n],
  ])("parses %j", (input, expected) => {
    expect(parseContribution(input)).toBe(expected)
  })

  it.each(["", "999", "10000001", "abc", "-5000", "20.5"])("rejects %j", (input) => {
    expect(parseContribution(input)).toBeNull()
  })
})

describe("clampParticipants", () => {
  it("keeps the count between 2 and 20", () => {
    expect(clampParticipants(1)).toBe(2)
    expect(clampParticipants(25)).toBe(20)
    expect(clampParticipants(Number.NaN)).toBe(2)
    expect(clampParticipants(6)).toBe(6)
  })
})
