import { describe, expect, it } from "vitest"
import { amount, applyBps, formatAmount, parseWholeUnits, percent, sum, toBig } from "./money"

const COP = { assetCode: "COP", assetScale: 2 } as const
const USD = { assetCode: "USD", assetScale: 2 } as const

describe("applyBps", () => {
  it("takes 2% of a 100,000 COP pot exactly", () => {
    expect(applyBps(10_000_000n, 200)).toBe(200_000n)
  })

  it("rounds down instead of producing fractions of a minor unit", () => {
    expect(applyBps(999n, 200)).toBe(19n)
  })

  it("stays exact beyond Number.MAX_SAFE_INTEGER", () => {
    const big = 9_007_199_254_740_993n
    expect(applyBps(big, 10_000)).toBe(big)
  })
})

describe("parseWholeUnits", () => {
  it("converts whole pesos to minor units", () => {
    expect(parseWholeUnits("20000", 2)).toBe(2_000_000n)
  })

  it("accepts thousands separators from either locale", () => {
    expect(parseWholeUnits("20.000", 2)).toBe(2_000_000n)
    expect(parseWholeUnits("20,000", 2)).toBe(2_000_000n)
  })

  it.each(["", "abc", "-5", "12e3", "1".repeat(16)])("rejects %j", (input) => {
    expect(parseWholeUnits(input, 2)).toBeNull()
  })
})

describe("formatAmount", () => {
  it("formats COP without decimals when the amount is whole", () => {
    expect(formatAmount({ value: "2000000", ...COP }, "en")).toBe("COP\u00a020,000")
    expect(formatAmount({ value: "2000000", ...COP }, "es")).toMatch(/^\$\s20\.000$/)
  })

  it("keeps the minor units when there are any", () => {
    expect(formatAmount({ value: "123456", ...USD }, "en")).toBe("$1,234.56")
    expect(formatAmount({ value: "5", ...USD }, "en")).toBe("$0.05")
  })

  it("formats negatives", () => {
    expect(formatAmount({ value: "-200000", ...COP }, "en")).toBe("-COP\u00a02,000")
  })
})

describe("helpers", () => {
  it("sum, toBig and amount keep the money tuple", () => {
    expect(sum([1n, 2n, 3n])).toBe(6n)
    expect(toBig({ value: "42", ...COP })).toBe(42n)
    expect(amount(7n, COP)).toEqual({ value: "7", assetCode: "COP", assetScale: 2 })
  })

  it("percent is clamped to 0–100", () => {
    expect(percent(80n, 100n)).toBe(80)
    expect(percent(150n, 100n)).toBe(100)
    expect(percent(5n, 0n)).toBe(0)
  })
})
