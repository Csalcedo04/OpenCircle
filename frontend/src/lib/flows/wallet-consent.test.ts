import { describe, expect, it } from "vitest"
import { consentFailurePath, consentFailureReason, consentMessageKey, walletAddressFromInput, walletErrorKey } from "./wallet-consent"

describe("walletAddressFromInput", () => {
  it("turns the username users remember into a test-network wallet address", () => {
    expect(walletAddressFromInput("ana")).toBe("$ilp.interledger-test.dev/ana")
    expect(walletAddressFromInput("  ana.gomez_01-co ")).toBe("$ilp.interledger-test.dev/ana.gomez_01-co")
  })

  it("keeps a pasted full address, with or without $", () => {
    expect(walletAddressFromInput("$ilp.interledger-test.dev/ana")).toBe("$ilp.interledger-test.dev/ana")
    expect(walletAddressFromInput("https://ilp.interledger-test.dev/ana")).toBe("https://ilp.interledger-test.dev/ana")
    expect(walletAddressFromInput("ilp.interledger-test.dev/ana")).toBe("$ilp.interledger-test.dev/ana")
  })

  it("rejects what can't be a username or an address", () => {
    for (const bad of ["", "ana gomez", "ana/../x", "http://ilp.interledger-test.dev/ana", "ana?x=1", "<script>"]) {
      expect(walletAddressFromInput(bad), bad).toBeNull()
    }
  })
})

describe("walletErrorKey", () => {
  it("maps start errors and falls back to generic", () => {
    expect(walletErrorKey("WALLET_NOT_ALLOWED")).toBe("walletNotAllowed")
    expect(walletErrorKey("OPEN_PAYMENTS_ERROR")).toBe("walletUnreachable")
    expect(walletErrorKey("VALIDATION_ERROR")).toBe("wallet")
    expect(walletErrorKey("PROFILE_NOT_FOUND")).toBe("generic")
    expect(walletErrorKey("BACKEND_UNAVAILABLE")).toBe("unavailable")
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

describe("consentFailurePath", () => {
  it("returns to onboarding's wallet step by default", () => {
    expect(consentFailurePath(undefined, "es", "rejected")).toBe("/es/onboarding?source=wallet&consent=rejected")
    expect(consentFailurePath("/es/circles/abc/join", "es", "expired")).toBe("/es/onboarding?source=wallet&consent=expired")
  })

  it("returns to the account page when linking started there", () => {
    expect(consentFailurePath("/en/account", "en", "taken")).toBe("/en/account?consent=taken")
    // A return path for another locale is not this page.
    expect(consentFailurePath("/es/account", "en", "taken")).toBe("/en/onboarding?source=wallet&consent=taken")
  })
})
