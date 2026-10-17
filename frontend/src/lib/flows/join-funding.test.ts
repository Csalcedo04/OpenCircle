import { describe, expect, it } from "vitest"
import { circleErrorKey, parseJoinForm } from "./circles"
import { defaultFundingSource, grantModeFor, isBelowContribution } from "./join-funding"

const cop = (value: string) => ({ value, assetCode: "COP", assetScale: 2 })

describe("defaultFundingSource", () => {
  it("prefers the OpenCircle account, then the wallet, then nothing", () => {
    expect(defaultFundingSource(["INTERNAL_ACCOUNT", "EXTERNAL_WALLET"])).toBe("INTERNAL_ACCOUNT")
    expect(defaultFundingSource(["EXTERNAL_WALLET"])).toBe("EXTERNAL_WALLET")
    expect(defaultFundingSource([])).toBeNull()
  })
})

describe("grantModeFor", () => {
  it("drops the grant mode when the account pays", () => {
    expect(grantModeFor("INTERNAL_ACCOUNT", "RECURRING")).toBeNull()
    expect(grantModeFor("EXTERNAL_WALLET", "PER_ROUND")).toBe("PER_ROUND")
  })
})

describe("isBelowContribution", () => {
  it("compares integers in minor units, never floats", () => {
    expect(isBelowContribution(cop("199999"), cop("200000"))).toBe(true)
    expect(isBelowContribution(cop("200000"), cop("200000"))).toBe(false)
    expect(isBelowContribution(cop("90071992547409930"), cop("90071992547409929"))).toBe(false)
  })

  it("never warns without an account", () => {
    expect(isBelowContribution(null, cop("1"))).toBe(false)
  })
})

describe("parseJoinForm with a funding source", () => {
  it("sends the chosen source and keeps the grant mode only for the wallet", () => {
    expect(parseJoinForm({ collateral: "", grantMode: "RECURRING", fundingSource: "INTERNAL_ACCOUNT" }, { assetScale: 2 })).toEqual({
      ok: true,
      seat: { collateralValue: "0", grantMode: null, fundingSource: "INTERNAL_ACCOUNT" },
    })
    expect(parseJoinForm({ collateral: "", grantMode: "RECURRING", fundingSource: "EXTERNAL_WALLET" }, { assetScale: 2 })).toEqual({
      ok: true,
      seat: { collateralValue: "0", grantMode: "RECURRING", fundingSource: "EXTERNAL_WALLET" },
    })
  })

  it("lets the API pick when the source is missing or unknown", () => {
    const parsed = parseJoinForm({ collateral: "", grantMode: "PER_ROUND", fundingSource: "<script>" }, { assetScale: 2 })
    expect(parsed).toEqual({ ok: true, seat: { collateralValue: "0", grantMode: "PER_ROUND" } })
  })
})

describe("circleErrorKey for funding errors", () => {
  it("maps the API's funding codes to their messages", () => {
    expect(circleErrorKey("INSUFFICIENT_FUNDS")).toBe("insufficientFunds")
    expect(circleErrorKey("INTERNAL_ACCOUNT_REQUIRED")).toBe("fundingUnavailable")
    expect(circleErrorKey("ASSET_MISMATCH")).toBe("fundingUnavailable")
  })
})
