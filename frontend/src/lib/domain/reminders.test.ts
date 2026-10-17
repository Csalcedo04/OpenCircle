import { describe, expect, it } from "vitest"
import { roundReminderStatus } from "./reminders"
import type { Contribution, Round } from "./types"

describe("roundReminderStatus", () => {
  const baseContributions: Contribution[] = [
    { memberId: "m1", status: "PENDING" },
    { memberId: "m2", status: "VERIFIED" },
  ]

  const round: Pick<Round, "status" | "deadline" | "contributions"> = {
    status: "COLLECTING",
    deadline: "2026-10-20T12:00:00Z",
    contributions: baseContributions,
  }

  it("returns OVERDUE when deadline has passed", () => {
    const asOf = new Date("2026-10-21T00:00:00Z")
    expect(roundReminderStatus(round, asOf)).toBe("OVERDUE")
  })

  it("returns DUE_TODAY within 24 hours of deadline", () => {
    const asOf = new Date("2026-10-20T02:00:00Z")
    expect(roundReminderStatus(round, asOf)).toBe("DUE_TODAY")
  })

  it("returns DUE_SOON within 72 hours of deadline", () => {
    const asOf = new Date("2026-10-18T00:00:00Z")
    expect(roundReminderStatus(round, asOf)).toBe("DUE_SOON")
  })

  it("returns null if more than 72 hours away", () => {
    const asOf = new Date("2026-10-10T00:00:00Z")
    expect(roundReminderStatus(round, asOf)).toBeNull()
  })

  it("returns null when all contributions are verified", () => {
    const allVerified: Contribution[] = [
      { memberId: "m1", status: "VERIFIED" },
      { memberId: "m2", status: "VERIFIED" },
    ]
    const asOf = new Date("2026-10-20T02:00:00Z")
    expect(
      roundReminderStatus({ ...round, contributions: allVerified }, asOf),
    ).toBeNull()
  })

  it("returns null when round status is not COLLECTING", () => {
    const asOf = new Date("2026-10-20T02:00:00Z")
    expect(
      roundReminderStatus({ ...round, status: "PAID_OUT" }, asOf),
    ).toBeNull()
  })
})
