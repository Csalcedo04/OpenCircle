import { describe, expect, it } from "vitest"
import { fill, hasLocale } from "./config"
import en from "./dictionaries/en"
import es from "./dictionaries/es"

function shape(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => shape(v, `${path}[${i}]`))
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => shape(v, path ? `${path}.${k}` : k))
  return [path]
}

function strings(value: unknown): Array<[string, string]> {
  if (typeof value === "string") return [["", value]]
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v).map(([p, s]) => [`[${i}]${p}`, s] as [string, string]))
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => strings(v).map(([p, s]) => [`.${k}${p}`, s] as [string, string]))
  return []
}

describe("dictionaries", () => {
  it("es has exactly the same keys as en", () => {
    expect(shape(es)).toEqual(shape(en))
  })

  it("every string uses the same {placeholders} in both languages", () => {
    const esByPath = new Map(strings(es))
    for (const [path, text] of strings(en)) {
      const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
      expect(vars(esByPath.get(path) ?? ""), path).toEqual(vars(text))
    }
  })

  it("no string is left empty", () => {
    for (const [path, text] of [...strings(en), ...strings(es)]) expect(text.trim(), path).not.toBe("")
  })
})

describe("config", () => {
  it("fills placeholders and leaves unknown ones", () => {
    expect(fill("Round {round} of {size}", { round: 2, size: 5 })).toBe("Round 2 of 5")
    expect(fill("{missing}", {})).toBe("{missing}")
  })

  it("recognizes only supported locales", () => {
    expect(hasLocale("es")).toBe(true)
    expect(hasLocale("fr")).toBe(false)
  })
})
