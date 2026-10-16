import type { Amount } from "./types"

/** Integer-only money helpers. No `number` ever touches an amount. */

export function amount(value: bigint, like: Pick<Amount, "assetCode" | "assetScale">): Amount {
  return { value: value.toString(), assetCode: like.assetCode, assetScale: like.assetScale }
}

export function toBig(a: Amount | string): bigint {
  return BigInt(typeof a === "string" ? a : a.value)
}

export function sum(values: readonly bigint[]): bigint {
  return values.reduce((acc, v) => acc + v, 0n)
}

/** Basis-point share, rounded down: value * bps / 10_000. */
export function applyBps(value: bigint, bps: number): bigint {
  return (value * BigInt(bps)) / 10_000n
}

/** Integer percentage (0–100), rounded down, for progress UI. */
export function percent(part: bigint, whole: bigint): number {
  if (whole <= 0n) return 0
  const p = (part * 100n) / whole
  return Number(p > 100n ? 100n : p < 0n ? 0n : p)
}

/** Parse a whole-unit user input like "20000" or "20.000" into minor units. */
export function parseWholeUnits(input: string, assetScale: number): bigint | null {
  const digits = input.replace(/[.,\s]/g, "")
  if (!/^\d{1,15}$/.test(digits)) return null
  return BigInt(digits) * 10n ** BigInt(assetScale)
}

const intlLocale = { en: "en-US", es: "es-CO" } as const

export function formatAmount(a: Amount, locale: keyof typeof intlLocale): string {
  const v = toBig(a)
  const scale = BigInt(a.assetScale)
  const base = 10n ** scale
  const negative = v < 0n
  const abs = negative ? -v : v
  const whole = abs / base
  const frac = abs % base
  const hasFrac = frac !== 0n
  // Intl accepts exact decimal strings, so no float conversion happens here.
  const decimal = hasFrac
    ? `${negative ? "-" : ""}${whole}.${frac.toString().padStart(a.assetScale, "0")}`
    : `${negative ? "-" : ""}${whole}`
  const fmt = new Intl.NumberFormat(intlLocale[locale], {
    style: "currency",
    currency: a.assetCode,
    minimumFractionDigits: hasFrac ? a.assetScale : 0,
    maximumFractionDigits: hasFrac ? a.assetScale : 0,
  })
  return fmt.format(decimal as unknown as number)
}
