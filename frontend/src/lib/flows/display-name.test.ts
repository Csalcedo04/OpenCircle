import { describe, expect, it } from "vitest"
import { headerName } from "./display-name"

describe("headerName", () => {
  it("prefers the profile name, else the email's local part", () => {
    expect(headerName("Ana Gómez", "ana@example.com")).toBe("Ana Gómez")
    expect(headerName(null, "ana@example.com")).toBe("ana")
    expect(headerName("   ", "ana@example.com")).toBe("ana")
    expect(headerName(undefined, undefined)).toBe("")
  })
})
