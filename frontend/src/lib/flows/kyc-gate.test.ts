import { describe, expect, it } from "vitest"
import { isKycPending, kycGateState } from "./kyc-gate"

describe("kycGateState", () => {
  it("opens only for approved users", () => {
    expect(kycGateState({ status: "Approved", approved: true })).toBe("open")
    expect(kycGateState({ status: "Approved", approved: false })).not.toBe("open")
  })

  it("waits while Didit reviews", () => {
    expect(kycGateState({ status: "In Review", approved: false })).toBe("in-review")
  })

  it("checks for a result while the session is unfinished or resubmitted", () => {
    expect(kycGateState({ status: "In Progress", approved: false })).toBe("checking")
    expect(kycGateState({ status: "Resubmitted", approved: false })).toBe("checking")
  })

  it("offers a retry after a decline or an expired approval", () => {
    expect(kycGateState({ status: "Declined", approved: false })).toBe("declined")
    expect(kycGateState({ status: "Kyc Expired", approved: false })).toBe("declined")
  })

  it("asks to verify when never started or unfinished", () => {
    for (const status of [null, "Not Started", "Awaiting User", "Expired", "Abandoned"]) {
      expect(kycGateState({ status, approved: false }), String(status)).toBe("verify")
    }
  })
})

describe("isKycPending", () => {
  it("keeps checking while Didit is still deciding", () => {
    for (const status of ["In Progress", "In Review", "Resubmitted"]) {
      expect(isKycPending({ status, approved: false }), status).toBe(true)
    }
  })

  it("stops once there is a decision or nothing to wait for", () => {
    for (const status of [null, "Not Started", "Approved", "Declined", "Expired", "Abandoned", "Kyc Expired", "Awaiting User"]) {
      expect(isKycPending({ status, approved: status === "Approved" }), String(status)).toBe(false)
    }
  })
})
