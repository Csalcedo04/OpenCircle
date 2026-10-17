import { describe, expect, it } from "vitest"
import { roundReminderStatus } from "./reminders"

describe("roundReminderStatus", () => {
  const round = { status: "COLLECTING" as const, deadline: "2026-10-20T12:00:00Z" }
  const pending = { status: "PENDING" as const }

  it("is OVERDUE once the deadline passed", () => {
    expect(roundReminderStatus(round, pending, new Date("2026-10-21T00:00:00Z"))).toBe("OVERDUE")
  })

  it("is DUE_TODAY within 24 hours and DUE_SOON within 72", () => {
    expect(roundReminderStatus(round, pending, new Date("2026-10-20T02:00:00Z"))).toBe("DUE_TODAY")
    expect(roundReminderStatus(round, pending, new Date("2026-10-18T00:00:00Z"))).toBe("DUE_SOON")
  })

  it("says nothing more than 72 hours ahead", () => {
    expect(roundReminderStatus(round, pending, new Date("2026-10-10T00:00:00Z"))).toBeNull()
  })

  it("only reminds the viewer about their own unpaid contribution", () => {
    const asOf = new Date("2026-10-20T02:00:00Z")
    expect(roundReminderStatus(round, { status: "VERIFIED" }, asOf)).toBeNull()
    expect(roundReminderStatus(round, { status: "REFUNDED" }, asOf)).toBeNull()
    expect(roundReminderStatus(round, undefined, asOf), "not a member of this round").toBeNull()
  })

  it("says nothing unless the round is collecting", () => {
    expect(roundReminderStatus({ ...round, status: "PAID_OUT" }, pending, new Date("2026-10-20T02:00:00Z"))).toBeNull()
    expect(roundReminderStatus({ ...round, deadline: "nope" }, pending, new Date("2026-10-20T02:00:00Z"))).toBeNull()
  })
})
