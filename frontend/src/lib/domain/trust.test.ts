import { describe, expect, it } from "vitest"
import { trustFor } from "./trust"
import type { Member, Review } from "./types"

const member = (payments: Member["payments"]): Member => ({
  id: "m",
  name: "Test Member",
  walletAddress: "https://ilp.interledger-test.dev/m",
  memberSince: "2026-01-01",
  payments,
  circlesCompleted: 0,
})

const review = (rating: Review["rating"]): Review => ({
  id: `r${rating}`,
  authorId: "x",
  subjectId: "m",
  circleId: "c",
  rating,
  comment: "",
  date: "2026-01-01",
})

describe("trustFor", () => {
  it("weights on-time payments 70% and reviews 30%", () => {
    // 9 of 12 on time = 75; reviews 3 and 4 → 3.5 stars → 63 on 0–100.
    const t = trustFor(member({ onTime: 9, late: 2, missed: 1 }), [review(3), review(4)])
    expect(t.onTimeRate).toBe(75)
    expect(t.ratingTenths).toBe(35)
    expect(t.score).toBe(71)
    expect(t.level).toBe("BUILDING")
  })

  it("is exemplary with a perfect record", () => {
    const t = trustFor(member({ onTime: 20, late: 0, missed: 0 }), [review(5), review(5)])
    expect(t.score).toBe(100)
    expect(t.level).toBe("EXEMPLARY")
  })

  it("marks members with fewer than 3 payments as new", () => {
    expect(trustFor(member({ onTime: 2, late: 0, missed: 0 }), []).level).toBe("NEW")
  })

  it("ignores reviews about other members", () => {
    const other = { ...review(1), subjectId: "someone-else" }
    expect(trustFor(member({ onTime: 10, late: 0, missed: 0 }), [other]).reviewCount).toBe(0)
  })
})
