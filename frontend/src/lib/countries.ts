import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min"

export interface CountryOption {
  /** ISO 3166-1 alpha-2, e.g. "CO". */
  code: string
  name: string
  /** International dialing code without "+", e.g. "57". */
  dial: string
  flag: string
}

export interface CountryOptions {
  frequent: CountryOption[]
  all: CountryOption[]
}

// Shown first: where OpenCircle's users are most likely from.
const FREQUENT: CountryCode[] = ["CO", "VE", "EC", "PE", "MX", "US", "ES", "AR", "CL", "PA"]

/** "CO" → 🇨🇴 (regional indicator letters). */
export const flagOf = (code: string): string =>
  String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))

/**
 * Countries for the nationality and phone pickers, named in the page's language.
 * Built on the server so the phone metadata never ships to the browser.
 */
export function countryOptions(locale: string): CountryOptions {
  const names = new Intl.DisplayNames([locale], { type: "region" })
  const all = getCountries()
    .map((code) => ({ code, name: names.of(code) ?? code, dial: getCountryCallingCode(code), flag: flagOf(code) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale))
  const byCode = new Map(all.map((c) => [c.code, c]))
  return { frequent: FREQUENT.flatMap((code) => byCode.get(code) ?? []), all }
}

const isCountryCode = (code: string): code is CountryCode => (getCountries() as string[]).includes(code)

/** National number + country → E.164 ("+573001234567"), or null if it isn't a valid number there. */
export function toE164(country: string, nationalNumber: string): string | null {
  if (!isCountryCode(country)) return null
  const phone = parsePhoneNumberFromString(nationalNumber, country)
  return phone?.isValid() && phone.country === country ? phone.number : null
}

/** "+573001234567" → { country: "CO", national: "3001234567" }, to prefill the pickers. */
export function splitPhone(e164: string | null | undefined): { country: string; national: string } | null {
  if (!e164) return null
  const phone = parsePhoneNumberFromString(e164)
  return phone?.country ? { country: phone.country, national: phone.nationalNumber } : null
}
