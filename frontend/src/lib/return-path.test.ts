import { describe, expect, it } from "vitest"
import { isInAppPath } from "./return-path"

describe("isInAppPath", () => {
  it("accepts localized in-app paths", () => {
    for (const path of ["/es", "/en/circles", "/es/circles/natillera-laureles/join", "/en/circles/new"]) {
      expect(isInAppPath(path)).toBe(true)
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
      "/es/circles#x",
      "es/circles",
      "",
      `/es/${"a".repeat(200)}`,
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
