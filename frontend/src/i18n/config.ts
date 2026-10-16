export const locales = ["en", "es"] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = "es"
export const LOCALE_COOKIE = "NEXT_LOCALE"

export function hasLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value)
}

/** Fill `{name}` placeholders in a dictionary string. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match))
}
