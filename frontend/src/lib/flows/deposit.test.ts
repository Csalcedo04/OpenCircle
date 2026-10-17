import { describe, expect, it } from "vitest"
import { depositErrorKey, isDepositPending, parseDepositInput } from "./deposit"

describe("parseDepositInput", () => {
  it("turns whole units into minor units as an integer string", () => {
    expect(parseDepositInput("20000", 2)).toBe("2000000")
    expect(parseDepositInput("20.000", 2)).toBe("2000000")
    expect(parseDepositInput(" 1 ", 0)).toBe("1")
  })

  it("rejects zero, text and oversized amounts", () => {
    for (const bad of ["", "0", "0,0", "abc", "-5", "1234567890123456"]) {
      expect(parseDepositInput(bad, 2), bad).toBeNull()
    }
  })

  it("reads dots and commas as thousands separators, like the rest of the app", () => {
    expect(parseDepositInput("1.000", 2)).toBe("100000")
    expect(parseDepositInput("1,000", 2)).toBe("100000")
  })
})

describe("isDepositPending", () => {
  it("is true only while the money hasn't arrived", () => {
    expect(isDepositPending({ status: "PENDING" })).toBe(true)
    expect(isDepositPending({ status: "COMPLETED" })).toBe(false)
    expect(isDepositPending({ status: "FAILED" })).toBe(false)
  })
})

describe("depositErrorKey", () => {
  it("maps API codes and falls back to generic", () => {
    expect(depositErrorKey("VALIDATION_ERROR")).toBe("amount")
    expect(depositErrorKey("INTERNAL_ACCOUNT_NOT_FOUND")).toBe("noAccount")
    expect(depositErrorKey("OPEN_PAYMENTS_ERROR")).toBe("openPayments")
    expect(depositErrorKey("PAYMENT_REFUSED")).toBe("openPayments")
    expect(depositErrorKey("WALLET_NOT_AUTHORIZED")).toBe("walletNotAuthorized")
    expect(depositErrorKey("DEPOSIT_NOT_PENDING")).toBe("notPending")
    expect(depositErrorKey("BACKEND_UNAVAILABLE")).toBe("unavailable")
    expect(depositErrorKey("whatever")).toBe("generic")
  })
})
