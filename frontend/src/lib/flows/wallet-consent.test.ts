import { describe, expect, it } from "vitest"
import { consentFailureReason, consentMessageKey, isWalletInput, walletErrorKey } from "./wallet-consent"

describe("isWalletInput", () => {
  it("accepts payment pointers and https addresses only", () => {
    expect(isWalletInput("$ilp.interledger-test.dev/ana")).toBe(true)
    expect(isWalletInput("https://ilp.interledger-test.dev/ana")).toBe(true)
    for (const bad of ["", "ana", "http://ilp.interledger-test.dev/ana", "$ilp.interledger-test.dev/ ana"]) {
      expect(isWalletInput(bad), bad).toBe(false)
    }
  })
})

describe("walletErrorKey", () => {
  it("maps start errors and falls back to generic", () => {
    expect(walletErrorKey("WALLET_NOT_ALLOWED")).toBe("walletNotAllowed")
    expect(walletErrorKey("OPEN_PAYMENTS_ERROR")).toBe("walletUnreachable")
    expect(walletErrorKey("VALIDATION_ERROR")).toBe("wallet")
    expect(walletErrorKey("PROFILE_NOT_FOUND")).toBe("generic")
  })
})

describe("consent round trip", () => {
  it("every completion error reaches a message on the onboarding page", () => {
    for (const code of ["CONSENT_NOT_FOUND", "CONSENT_INVALID", "VALIDATION_ERROR", "WALLET_ALREADY_LINKED", "WALLET_IN_USE", "OTHER"]) {
      expect(consentMessageKey(consentFailureReason(code)), code).not.toBeNull()
    }
    expect(consentMessageKey(consentFailureReason("CONSENT_NOT_FOUND"))).toBe("consentExpired")
    expect(consentMessageKey(consentFailureReason("WALLET_IN_USE"))).toBe("walletTaken")
    expect(consentMessageKey("rejected")).toBe("consentRejected")
  })

  it("ignores unknown or missing ?consent= values", () => {
    expect(consentMessageKey(undefined)).toBeNull()
    expect(consentMessageKey("<script>")).toBeNull()
    expect(consentMessageKey(["rejected"])).toBeNull()
  })
})
