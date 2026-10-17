import { describe, expect, it } from "vitest"
import { circleErrorKey, parseCreateForm, parseJoinForm, type CreateFields } from "./circles"

const valid: CreateFields = { name: "Natillera Laureles", amount: "20.000", size: "5", cadence: "WEEKLY", payoutRound: "2", visibility: "PRIVATE" }

describe("parseCreateForm", () => {
  it("turns whole pesos into minor units and builds the API request", () => {
    expect(parseCreateForm(valid)).toEqual({
      ok: true,
      request: { name: "Natillera Laureles", contributionValue: "2000000", size: 5, cadence: "WEEKLY", payoutRound: 2, visibility: "PRIVATE" },
    })
  })

  it("sends the visibility, falling back to private for anything unexpected", () => {
    expect(parseCreateForm({ ...valid, visibility: "PUBLIC" })).toMatchObject({ ok: true, request: { visibility: "PUBLIC" } })
    expect(parseCreateForm({ ...valid, visibility: "EVERYONE" })).toMatchObject({ ok: true, request: { visibility: "PRIVATE" } })
  })

  it("flags each invalid field", () => {
    const r = parseCreateForm({ name: "ab", amount: "500", size: "13", cadence: "DAILY", payoutRound: "0", visibility: "PRIVATE" })
    expect(r).toEqual({ ok: false, errors: { name: "name", cadence: "cadence", amount: "amount", size: "size", seat: "seat" } })
  })

  it("keeps the payout round within the circle size", () => {
    expect(parseCreateForm({ ...valid, payoutRound: "6" })).toMatchObject({ ok: false, errors: { seat: "seat" } })
    expect(parseCreateForm({ ...valid, payoutRound: "5" }).ok).toBe(true)
  })

  it("rejects fractional or out-of-range amounts", () => {
    for (const amount of ["20000,50x", "999", "10000001", ""]) {
      expect(parseCreateForm({ ...valid, amount }).ok, amount).toBe(false)
    }
  })
})

describe("parseJoinForm", () => {
  const circle = { size: 5, assetScale: 2 }

  it("builds the seat request; empty collateral is 0", () => {
    expect(parseJoinForm({ payoutRound: "3", collateral: "", grantMode: "RECURRING" }, circle)).toEqual({
      ok: true,
      seat: { payoutRound: 3, collateralValue: "0", grantMode: "RECURRING" },
    })
    expect(parseJoinForm({ payoutRound: "3", collateral: "50.000", grantMode: "PER_ROUND" }, circle)).toMatchObject({
      seat: { collateralValue: "5000000", grantMode: "PER_ROUND" },
    })
  })

  it("rejects rounds outside the circle and bad collateral; unknown grant modes become null", () => {
    expect(parseJoinForm({ payoutRound: "6", collateral: "", grantMode: "" }, circle)).toMatchObject({ ok: false, errors: { seat: "seat" } })
    expect(parseJoinForm({ payoutRound: "1", collateral: "abc", grantMode: "" }, circle)).toMatchObject({ ok: false, errors: { collateral: "collateral" } })
    expect(parseJoinForm({ payoutRound: "1", collateral: "", grantMode: "WHATEVER" }, circle)).toMatchObject({ seat: { grantMode: null } })
  })
})

describe("circleErrorKey", () => {
  it("maps API conflicts to messages and falls back to generic", () => {
    expect(circleErrorKey("SEAT_TAKEN")).toBe("seatTaken")
    expect(circleErrorKey("ALREADY_MEMBER")).toBe("alreadyMember")
    expect(circleErrorKey("CIRCLE_NOT_OPEN")).toBe("notOpen")
    expect(circleErrorKey("KYC_REQUIRED")).toBe("kyc")
    expect(circleErrorKey("BACKEND_UNAVAILABLE")).toBe("unavailable")
    expect(circleErrorKey("NEW_CODE")).toBe("generic")
  })
})
