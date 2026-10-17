import { describe, expect, it } from "vitest"
import { friendErrorKey, parseFriendRequestForm } from "./friends"

describe("parseFriendRequestForm", () => {
  it("normalizes a valid email", () => {
    expect(parseFriendRequestForm({ email: "  Ana@Example.test " })).toEqual({ ok: true, email: "ana@example.test" })
  })

  it("rejects anything that isn't an email", () => {
    for (const email of ["", "ana", "ana@", "@example.test"]) {
      expect(parseFriendRequestForm({ email }), email).toEqual({ ok: false, error: "email" })
    }
  })
})

describe("friendErrorKey", () => {
  it("maps the API's codes and falls back to generic", () => {
    expect(friendErrorKey("PROFILE_NOT_FOUND")).toBe("userNotFound")
    expect(friendErrorKey("ALREADY_FRIENDS")).toBe("alreadyFriends")
    expect(friendErrorKey("FRIEND_REQUEST_PENDING")).toBe("requestPending")
    expect(friendErrorKey("CANNOT_FRIEND_SELF")).toBe("self")
    expect(friendErrorKey("FRIEND_REQUEST_NOT_FOUND")).toBe("notFound")
    expect(friendErrorKey("FRIEND_NOT_FOUND")).toBe("notFound")
    expect(friendErrorKey("RATE_LIMITED")).toBe("rateLimited")
    expect(friendErrorKey("BACKEND_UNAVAILABLE")).toBe("unavailable")
    expect(friendErrorKey("WHATEVER")).toBe("generic")
  })
})
