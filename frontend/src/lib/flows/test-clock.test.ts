import { describe, expect, it } from "vitest"
import { apiCircleSchema, testClockSchema } from "@/lib/api/test-clocks"
import { freePayoutRounds, nextBoundary, parseClockCircleForm, testClocksEnabled, utcFromLocalInput } from "./test-clock"

const ID = "11111111-1111-4111-8111-111111111111"
const circle = (nextBoundary: string | null) => ({
  id: ID,
  name: "c",
  status: "ACTIVE",
  cadence: "MONTHLY" as const,
  size: 3,
  seatsTaken: 3,
  inviteCode: "code",
  currentPeriod: null,
  nextBoundary,
})

describe("test clock flows", () => {
  it("is off unless the env says exactly true", () => {
    expect(testClocksEnabled({})).toBe(false)
    expect(testClocksEnabled({ TEST_CLOCKS_ENABLED: "1" })).toBe(false)
    expect(testClocksEnabled({ TEST_CLOCKS_ENABLED: "true" })).toBe(true)
  })

  it("advances to the earliest boundary across circles", () => {
    expect(nextBoundary({ circles: [circle("2026-03-31T12:00:00.000Z"), circle("2026-03-09T15:00:00.000Z"), circle(null)] })).toBe(
      "2026-03-09T15:00:00.000Z",
    )
    expect(nextBoundary({ circles: [circle(null)] })).toBeNull()
  })

  it("lists the free payout rounds", () => {
    expect(freePayoutRounds(4, [{ payoutRound: 1 }, { payoutRound: 3 }])).toEqual([2, 4])
  })

  it("parses the create-circle form into minor units and a cadence", () => {
    const ok = parseClockCircleForm({ name: " Demo ", city: "Cali", contributionValue: "500", size: "3", cadence: "WEEKLY", payoutRound: "1" }, ID)
    expect(ok).toEqual({ ok: true, circle: { name: "Demo", city: "Cali", contributionValue: "500", size: 3, cadence: "WEEKLY", payoutRound: 1, testClockId: ID } })

    const bad = parseClockCircleForm({ name: "", city: "Cali", contributionValue: "5.5", size: "1", cadence: "DAILY", payoutRound: "4" }, ID)
    expect(bad).toEqual({ ok: false, errors: ["name", "contributionValue", "size", "cadence", "payoutRound"] })
  })

  it("reads the datetime input as UTC", () => {
    expect(utcFromLocalInput("2026-01-31T12:00")).toBe("2026-01-31T12:00:00.000Z")
    expect(utcFromLocalInput("tomorrow")).toBeNull()
  })

  it("parses the API's clock and circle responses", () => {
    const clock = testClockSchema.parse({
      id: ID,
      name: "demo",
      frozenTime: "2026-02-28T12:00:00.000Z",
      circles: [
        {
          ...circle("2026-03-31T12:00:00.000Z"),
          currentPeriod: {
            number: 2,
            state: "COLLECTING",
            startsAt: "2026-02-28T12:00:00.000Z",
            deadline: "2026-03-31T12:00:00.000Z",
            beneficiary: { memberId: ID, displayName: "Bob R." },
            contributions: [{ memberId: ID, displayName: "Bob R.", status: "PROCESSING", failureCode: null }],
          },
        },
      ],
    })
    expect(clock.circles[0]?.currentPeriod?.number).toBe(2)

    const c = apiCircleSchema.parse({
      id: ID,
      name: "c",
      city: "Cali",
      status: "OPEN",
      contribution: { value: "500", assetCode: "USD", assetScale: 2 },
      size: 3,
      seatsTaken: 1,
      cadence: "WEEKLY",
      startedAt: null,
      testClockId: ID,
      seats: [{ memberId: ID, displayName: "Ana G.", payoutRound: 1, collateral: {}, grantMode: null }],
      rounds: [],
    })
    expect(c.seats).toHaveLength(1)
  })
})
