import { describe, expect, it } from "vitest"
import { isInAppPath, withInvite } from "./return-path"

describe("isInAppPath", () => {
  it("accepts localized in-app paths, with or without an invite token", () => {
    for (const path of [
      "/es",
      "/en/circles",
      "/es/circles/natillera-laureles/join",
      "/en/circles/new",
      "/es/circles/abc/join?invite=A-b_c123",
      `/es/circles/abc?invite=${"x".repeat(128)}`,
    ]) {
      expect(isInAppPath(path), path).toBe(true)
    }
  })

  it("rejects anything that could leave the app or smuggle extra URL parts", () => {
    for (const path of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "/es/../admin",
      "/fr/circles",
      "/es/circles?next=https://evil.example",
      "/es/circles?invite=",
      "/es/circles?invite=a/b",
      "/es/circles?invite=a%2Fb",
      "/es/circles?invite=abc&next=x",
      `/es/circles?invite=${"x".repeat(129)}`,
      "/es/circles#x",
      "es/circles",
      "",
      `/es/${"a".repeat(400)}`,
    ]) {
      expect(isInAppPath(path), path).toBe(false)
    }
  })

  it("rejects non-strings", () => {
    expect(isInAppPath(null)).toBe(false)
    expect(isInAppPath(undefined)).toBe(false)
    expect(isInAppPath(42)).toBe(false)
  })
})

describe("withInvite", () => {
  it("appends a well-formed token and ignores anything else", () => {
    expect(withInvite("/es/circles/abc/join", "tok_-1")).toBe("/es/circles/abc/join?invite=tok_-1")
    expect(withInvite("/es/circles/abc/join", undefined)).toBe("/es/circles/abc/join")
    expect(withInvite("/es/circles/abc/join", "")).toBe("/es/circles/abc/join")
    expect(withInvite("/es/circles/abc/join", "a/b")).toBe("/es/circles/abc/join")
    expect(isInAppPath(withInvite("/es/circles/abc/join", "tok"))).toBe(true)
  })
})
