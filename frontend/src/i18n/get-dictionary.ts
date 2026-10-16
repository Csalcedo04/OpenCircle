import { lang } from "next/root-params"
import { notFound } from "next/navigation"
import { hasLocale, type Locale } from "./config"
import type { Dictionary } from "./dictionaries/en"

const dictionaries: Record<Locale, () => Promise<Dictionary>> = {
  en: () => import("./dictionaries/en").then((m) => m.default),
  es: () => import("./dictionaries/es").then((m) => m.default),
}

export async function getLocale(): Promise<Locale> {
  const locale = await lang()
  if (!hasLocale(locale)) notFound()
  return locale
}

export async function getDictionary(): Promise<{ locale: Locale; t: Dictionary }> {
  const locale = await getLocale()
  return { locale, t: await dictionaries[locale]() }
}
