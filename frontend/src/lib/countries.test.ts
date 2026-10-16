import { describe, expect, it } from "vitest"
import { countryOptions, flagOf, splitPhone, toE164 } from "./countries"

describe("countryOptions", () => {
  it("names countries in the page's language, frequent ones first", () => {
    const es = countryOptions("es")
    expect(es.frequent[0]).toEqual({ code: "CO", name: "Colombia", dial: "57", flag: "🇨🇴" })
    expect(es.all.find((c) => c.code === "US")?.name).toBe("Estados Unidos")
    expect(countryOptions("en").all.find((c) => c.code === "US")?.name).toBe("United States")
  })

  it("lists every country once, sorted by name", () => {
    const { all } = countryOptions("es")
    expect(all.length).toBeGreaterThan(200)
    expect(new Set(all.map((c) => c.code)).size).toBe(all.length)
    const names = all.map((c) => c.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "es")))
  })
})

describe("phone helpers", () => {
  it("flagOf builds the emoji flag", () => {
    expect(flagOf("co")).toBe("🇨🇴")
  })

  it("toE164 and splitPhone round-trip", () => {
    const e164 = toE164("CO", "300 123 4567")
    expect(e164).toBe("+573001234567")
    expect(splitPhone(e164)).toEqual({ country: "CO", national: "3001234567" })
    expect(splitPhone(null)).toBeNull()
    expect(splitPhone("not a phone")).toBeNull()
  })
})
