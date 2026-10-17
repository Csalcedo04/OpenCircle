import { describe, expect, it } from "vitest"
import { circleErrorKey, parseCreateForm, parseJoinForm, type CreateFields } from "./circles"

const valid: CreateFields = { name: "Natillera Laureles", amount: "20.000", size: "5", cadence: "WEEKLY", payoutOrder: "BEST_SCORE_LAST", visibility: "PRIVATE" }

describe("parseCreateForm", () => {
  it("turns whole pesos into minor units and builds the API request", () => {
    expect(parseCreateForm(valid)).toEqual({
      ok: true,
      request: { name: "Natillera Laureles", contributionValue: "2000000", size: 5, cadence: "WEEKLY", payoutOrder: "BEST_SCORE_LAST", visibility: "PRIVATE" },
    })
  })

  it("sends the visibility, falling back to private for anything unexpected", () => {
    expect(parseCreateForm({ ...valid, visibility: "PUBLIC" })).toMatchObject({ ok: true, request: { visibility: "PUBLIC" } })
    expect(parseCreateForm({ ...valid, visibility: "EVERYONE" })).toMatchObject({ ok: true, request: { visibility: "PRIVATE" } })
  })

  it("flags each invalid field", () => {
    const r = parseCreateForm({ name: "ab", amount: "500", size: "13", cadence: "DAILY", payoutOrder: "BEST_SCORE_FIRST", visibility: "PRIVATE" })
    expect(r).toEqual({ ok: false, errors: { name: "name", cadence: "cadence", amount: "amount", size: "size" } })
  })

  it("accepts biweekly; an unexpected payout order falls back to best score first", () => {
    expect(parseCreateForm({ ...valid, cadence: "BIWEEKLY" })).toMatchObject({ ok: true, request: { cadence: "BIWEEKLY" } })
    expect(parseCreateForm({ ...valid, payoutOrder: "RANDOM" })).toMatchObject({ ok: true, request: { payoutOrder: "BEST_SCORE_FIRST" } })
  })

  it("rejects fractional or out-of-range amounts", () => {
    for (const amount of ["20000,50x", "999", "10000001", ""]) {
      expect(parseCreateForm({ ...valid, amount }).ok, amount).toBe(false)
    }
  })

  it("builds an END common-goal request with BigInt goalValue and roundsTotal", () => {
    expect(parseCreateForm({ ...valid, payoutMode: "END", roundsTotal: "10" })).toEqual({
      ok: true,
      request: {
        name: "Natillera Laureles",
        payoutMode: "END",
        goalValue: "100000000",
        roundsTotal: 10,
        size: 5,
        cadence: "WEEKLY",
        visibility: "PRIVATE",
      },
    })
  })

  it("rejects out-of-range roundsTotal in END mode", () => {
    expect(parseCreateForm({ ...valid, payoutMode: "END", roundsTotal: "1" })).toEqual({
      ok: false,
      errors: { roundsTotal: "roundsTotal" },
    })
    expect(parseCreateForm({ ...valid, payoutMode: "END", roundsTotal: "53" })).toEqual({
      ok: false,
      errors: { roundsTotal: "roundsTotal" },
    })
  })
})

describe("parseJoinForm", () => {
  const circle = { assetScale: 2 }

  it("builds the seat request; empty collateral is 0", () => {
    expect(parseJoinForm({ collateral: "", grantMode: "RECURRING" }, circle)).toEqual({
      ok: true,
      seat: { collateralValue: "0", grantMode: "RECURRING" },
    })
    expect(parseJoinForm({ collateral: "50.000", grantMode: "PER_ROUND" }, circle)).toMatchObject({
      seat: { collateralValue: "5000000", grantMode: "PER_ROUND" },
    })
  })

  it("rejects bad collateral; unknown grant modes become null", () => {
    expect(parseJoinForm({ collateral: "abc", grantMode: "" }, circle)).toMatchObject({ ok: false, errors: { collateral: "collateral" } })
    expect(parseJoinForm({ collateral: "", grantMode: "WHATEVER" }, circle)).toMatchObject({ seat: { grantMode: null } })
  })
})

describe("circleErrorKey", () => {
  it("maps API conflicts to messages and falls back to generic", () => {
    expect(circleErrorKey("SEAT_TAKEN")).toBe("seatTaken")
    expect(circleErrorKey("ALREADY_MEMBER")).toBe("alreadyMember")
    expect(circleErrorKey("CIRCLE_NOT_OPEN")).toBe("notOpen")
    expect(circleErrorKey("KYC_REQUIRED")).toBe("kyc")
    expect(circleErrorKey("DEBT_OUTSTANDING")).toBe("debtOutstanding")
    expect(circleErrorKey("GOAL_NOT_DIVISIBLE")).toBe("goalNotDivisible")
    expect(circleErrorKey("NOT_CREATOR")).toBe("notApprover")
    expect(circleErrorKey("BACKEND_UNAVAILABLE")).toBe("unavailable")
    expect(circleErrorKey("NOT_FOUND")).toBe("featureUnavailable")
    expect(circleErrorKey("NEW_CODE")).toBe("generic")
  })
})
