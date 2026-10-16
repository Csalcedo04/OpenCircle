"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Languages } from "lucide-react"
import { LOCALE_COOKIE, type Locale } from "@/i18n/config"

type Props = { locale: Locale; label: string; switchTo: string }

export function LocaleToggle({ locale, label, switchTo }: Props) {
  const pathname = usePathname()
  const next: Locale = locale === "en" ? "es" : "en"
  const href = pathname.replace(/^\/(en|es)(?=\/|$)/, `/${next}`)

  return (
    <Link
      href={href}
      hrefLang={next}
      aria-label={`${label}: ${switchTo}`}
      onClick={() => {
        document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
      }}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-brand-white outline-none hover:bg-brand-white/10 focus-visible:ring-3 focus-visible:ring-brand-mint"
    >
      <Languages className="size-4" aria-hidden="true" />
      {switchTo}
    </Link>
  )
}
