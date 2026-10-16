import type { MetadataRoute } from "next"
import { locales } from "@/i18n/config"
import { siteUrl } from "@/lib/site"

const pages = [
  { path: "", priority: 1 },
  { path: "/circles", priority: 0.6 },
  { path: "/privacidad", priority: 0.2 },
  { path: "/terminos", priority: 0.2 },
] as const

export default function sitemap(): MetadataRoute.Sitemap {
  return pages.flatMap(({ path, priority }) =>
    locales.map((lang) => ({
      url: new URL(`/${lang}${path}`, siteUrl).toString(),
      priority: lang === "es" ? priority : priority * 0.9,
      alternates: { languages: Object.fromEntries(locales.map((l) => [l, new URL(`/${l}${path}`, siteUrl).toString()])) },
    })),
  )
}
