import { describe, expect, it } from "vitest"
import { inviteErrorKey, localizedInviteUrl } from "./circle-invite"

describe("circle invite flows", () => {
  it("moves the invite link to the creator's language and keeps the code", () => {
    const url = "http://localhost:3001/es/circles/11111111-1111-4111-8111-111111111111?invite=abc_-123"
    expect(localizedInviteUrl(url, "en")).toBe("http://localhost:3001/en/circles/11111111-1111-4111-8111-111111111111?invite=abc_-123")
    expect(localizedInviteUrl(url, "es")).toBe(url)
  })

  it("leaves paths without a locale alone", () => {
    expect(localizedInviteUrl("https://x.test/circles/1?invite=a", "en")).toBe("https://x.test/circles/1?invite=a")
  })

  it("maps API errors to messages", () => {
    expect(inviteErrorKey("CIRCLE_NOT_OPEN")).toBe("notOpen")
    expect(inviteErrorKey("BACKEND_UNAVAILABLE")).toBe("unavailable")
    expect(inviteErrorKey("CIRCLE_NOT_FOUND")).toBe("generic")
  })
})
