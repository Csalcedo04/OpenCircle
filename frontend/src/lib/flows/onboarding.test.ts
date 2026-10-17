import { describe, expect, it } from "vitest"
import { accountErrorKey, fundingSources, isOnboarded, onboardingStep } from "./onboarding"

const wallet = { walletAddress: "https://ilp.interledger-test.dev/ana", internalAccount: null }
const account = { walletAddress: null, internalAccount: { id: "acc-1" } }
const both = { walletAddress: wallet.walletAddress, internalAccount: account.internalAccount }
const none = { walletAddress: null, internalAccount: null }

describe("isOnboarded", () => {
  it("is false without a profile or without any funding source", () => {
    expect(isOnboarded(null)).toBe(false)
    expect(isOnboarded(undefined)).toBe(false)
    expect(isOnboarded(none)).toBe(false)
  })

  it("is true with an internal account, an external wallet, or both", () => {
    expect(isOnboarded(account)).toBe(true)
    expect(isOnboarded(wallet)).toBe(true)
    expect(isOnboarded(both)).toBe(true)
  })
})

describe("fundingSources", () => {
  it("lists the internal account first", () => {
    expect(fundingSources(both)).toEqual(["INTERNAL_ACCOUNT", "EXTERNAL_WALLET"])
    expect(fundingSources(account)).toEqual(["INTERNAL_ACCOUNT"])
    expect(fundingSources(wallet)).toEqual(["EXTERNAL_WALLET"])
    expect(fundingSources(none)).toEqual([])
  })
})

describe("onboardingStep", () => {
  it("asks for the profile first, then for a funding source", () => {
    expect(onboardingStep(null, undefined)).toBe(1)
    expect(onboardingStep(none, undefined)).toBe(2)
  })

  it("reopens the profile step on demand", () => {
    expect(onboardingStep(none, "profile")).toBe(1)
    expect(onboardingStep(none, "wallet")).toBe(2)
  })
})

describe("accountErrorKey", () => {
  it("tells an unreachable API from everything else", () => {
    expect(accountErrorKey("BACKEND_UNAVAILABLE")).toBe("unavailable")
    expect(accountErrorKey("INTERNAL_ACCOUNT_EXISTS")).toBe("generic")
    expect(accountErrorKey("unknown")).toBe("generic")
  })
})
