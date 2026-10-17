import { describe, expect, it } from "vitest"
import { trustFor } from "./trust"
import type { Member } from "./types"

const member = (payments: Member["payments"], ratings: Member["ratings"] = { count: 0, tenths: 0 }): Member => ({
  id: "m",
  name: "Test M.",
  walletAddress: null,
  memberSince: "2026-01-01T00:00:00.000Z",
  payments,
  ratings,
  circlesCompleted: 0,
})

describe("trustFor", () => {
  it("weights on-time payments 70% and reviews 30%", () => {
    // 9 of 12 on time = 75; two reviews averaging 3.5 stars → 63 on 0–100.
    const t = trustFor(member({ onTime: 9, late: 2, missed: 1 }, { count: 2, tenths: 35 }))
    expect(t.onTimeRate).toBe(75)
    expect(t.ratingTenths).toBe(35)
    expect(t.reviewCount).toBe(2)
    expect(t.score).toBe(71)
    expect(t.level).toBe("BUILDING")
  })

  it("is exemplary with a perfect record", () => {
    const t = trustFor(member({ onTime: 20, late: 0, missed: 0 }, { count: 2, tenths: 50 }))
    expect(t.score).toBe(100)
    expect(t.level).toBe("EXEMPLARY")
  })

  it("marks members with fewer than 3 payments as new", () => {
    expect(trustFor(member({ onTime: 2, late: 0, missed: 0 })).level).toBe("NEW")
  })

  it("without reviews, trust is the on-time rate", () => {
    const t = trustFor(member({ onTime: 8, late: 2, missed: 0 }))
    expect(t.reviewCount).toBe(0)
    expect(t.score).toBe(80)
  })

  it("a member with no payments yet scores 0", () => {
    expect(trustFor(member({ onTime: 0, late: 0, missed: 0 }, { count: 3, tenths: 50 })).score).toBe(0)
  })
})
