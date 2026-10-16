import { describe, expect, it } from "vitest"
import { kycGateState } from "./kyc-gate"

describe("kycGateState", () => {
  it("opens only for approved users", () => {
    expect(kycGateState({ status: "Approved", approved: true })).toBe("open")
    expect(kycGateState({ status: "Approved", approved: false })).not.toBe("open")
  })

  it("waits while Didit reviews", () => {
    expect(kycGateState({ status: "In Review", approved: false })).toBe("in-review")
  })

  it("offers a retry after a decline or an expired approval", () => {
    expect(kycGateState({ status: "Declined", approved: false })).toBe("declined")
    expect(kycGateState({ status: "Kyc Expired", approved: false })).toBe("declined")
  })

  it("asks to verify when never started or unfinished", () => {
    for (const status of [null, "Not Started", "In Progress", "Expired", "Abandoned", "Resubmitted"]) {
      expect(kycGateState({ status, approved: false }), String(status)).toBe("verify")
    }
  })
})
