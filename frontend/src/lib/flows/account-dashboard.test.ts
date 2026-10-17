import { describe, expect, it } from "vitest"
import type { Dashboard, DashboardCircle, DashboardRound } from "@/lib/api/backend"
import { circleAction, nextAction, nextPayout, reliability, roundFunding, upcomingPayment } from "./account-dashboard"

const NOW = "2026-10-17T12:00:00.000Z"
const usd = (value: string) => ({ value, assetCode: "USD", assetScale: 2 })

const round = (number: number, patch: Partial<DashboardRound> = {}): DashboardRound => ({
  number,
  state: "UPCOMING",
  startsAt: `2026-10-${String(10 + number * 7 - 7).padStart(2, "0")}T00:00:00.000Z`,
  deadline: `2026-10-${String(10 + number * 7).padStart(2, "0")}T00:00:00.000Z`,
  mine: false,
  verified: 0,
  myContributionId: null,
  myStatus: null,
  myFailureCode: null,
  ...patch,
})

const circle = (patch: Partial<DashboardCircle> = {}): DashboardCircle => ({
  id: "11111111-1111-4111-8111-111111111111",
  name: "Natillera",
  status: "ACTIVE",
  cadence: "WEEKLY",
  size: 3,
  seatsTaken: 3,
  contribution: usd("2500"),
  expectedPayout: usd("7350"),
  myPayoutRound: 3,
  currentRound: 2,
  now: NOW,
  onTestClock: false,
  rounds: [
    round(1, { state: "FUNDED", verified: 3, myStatus: "COMPLETED" }),
    round(2, { state: "COLLECTING", verified: 1, myStatus: "PENDING" }),
    round(3, { mine: true }),
  ],
  ...patch,
})

const wallet = (status: "ACTIVE" | "REVOKED" | "NONE"): Dashboard["wallet"] => ({
  address: "https://ilp.interledger-test.dev/ana",
  assetCode: "USD",
  assetScale: 2,
  authorization: { status, since: null },
})

describe("circleAction", () => {
  it("schedules an owed contribution when the wallet authorization is active", () => {
    const action = circleAction(circle(), true)
    expect(action?.kind).toBe("SCHEDULED")
    expect(action?.round?.number).toBe(2)
    expect(action?.paidPrevious).toBe(true)
  })

  it("asks for authorization when there is no active grant", () => {
    expect(circleAction(circle(), false)?.kind).toBe("AUTHORIZATION_REQUIRED")
  })

  it("is due today on the deadline's UTC day, overdue after it (circle time)", () => {
    expect(circleAction(circle({ now: "2026-10-24T00:00:00.000Z" }), true)?.kind).toBe("DUE_TODAY")
    expect(circleAction(circle({ now: "2026-10-24T00:00:01.000Z" }), true)?.kind).toBe("OVERDUE")
  })

  it("shows processing, never completed, while the payment is in flight", () => {
    const c = circle({ rounds: [round(2, { state: "COLLECTING", myStatus: "PROCESSING" })] })
    expect(circleAction(c, true)?.kind).toBe("PROCESSING")
  })

  it("reports a failed contribution before anything upcoming", () => {
    const c = circle({ rounds: [round(1, { state: "BLOCKED", myStatus: "FAILED", myFailureCode: "NO_GRANT" }), round(2)] })
    const action = circleAction(c, true)
    expect(action?.kind).toBe("FAILED")
    expect(action?.round?.myFailureCode).toBe("NO_GRANT")
  })

  it("points at the next round once this one is paid", () => {
    const c = circle({ rounds: [round(1, { state: "COLLECTING", myStatus: "COMPLETED" }), round(2)] })
    const action = circleAction(c, true)
    expect(action?.kind).toBe("UPCOMING")
    expect(action?.round?.number).toBe(2)
  })

  it("waits for members while OPEN and has nothing to do once completed", () => {
    expect(circleAction(circle({ status: "OPEN", rounds: [] }), true)?.kind).toBe("WAITING_FOR_MEMBERS")
    expect(circleAction(circle({ status: "COMPLETED" }), true)).toBeNull()
  })
})

describe("nextAction", () => {
  it("picks the most urgent circle, then the earliest deadline", () => {
    const calm = circle({ id: "22222222-2222-4222-8222-222222222222", name: "Calm" })
    const late = circle({ name: "Late", now: "2026-11-01T00:00:00.000Z" })
    expect(nextAction({ circles: [calm, late], wallet: wallet("ACTIVE") })?.circle.name).toBe("Late")
  })

  it("is null without circles", () => {
    expect(nextAction({ circles: [], wallet: wallet("ACTIVE") })).toBeNull()
  })
})

describe("upcomingPayment", () => {
  it("ignores failed and waiting circles", () => {
    const failed = circle({ rounds: [round(1, { state: "BLOCKED", myStatus: "FAILED" })] })
    const open = circle({ status: "OPEN", rounds: [] })
    expect(upcomingPayment({ circles: [failed, open], wallet: wallet("ACTIVE") })).toBeNull()
    expect(upcomingPayment({ circles: [failed, circle()], wallet: wallet("ACTIVE") })?.round?.number).toBe(2)
  })
})

describe("nextPayout", () => {
  it("is the user's own round, skipping ones already paid out", () => {
    expect(nextPayout([circle()])?.round?.number).toBe(3)
    const paid = circle({ rounds: [round(1, { mine: true, state: "PAID_OUT" })] })
    expect(nextPayout([paid])).toBeNull()
  })
})

describe("roundFunding", () => {
  it("counts only verified contributions, in minor units", () => {
    const [view] = roundFunding([circle()])
    expect(view?.round.number).toBe(2)
    expect(view?.collected).toBe(2500n)
    expect(view?.target).toBe(7500n)
  })
})

describe("reliability", () => {
  it("is the on-time share of contributions that came due", () => {
    expect(reliability({ payments: { onTime: 3, late: 1, missed: 0 }, ratings: { count: 0, tenths: 0 }, circlesCompleted: 0, memberSince: null })).toBe(75)
    expect(reliability({ payments: { onTime: 0, late: 0, missed: 0 }, ratings: { count: 0, tenths: 0 }, circlesCompleted: 0, memberSince: null })).toBeNull()
  })
})
