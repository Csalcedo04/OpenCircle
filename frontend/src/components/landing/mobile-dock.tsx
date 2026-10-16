"use client"

import Link from "next/link"
import { CircleDot, HelpCircle, ShieldCheck, Sparkles, Zap } from "lucide-react"
import type { Locale } from "@/i18n/config"
import type { LandingDictionary } from "@/i18n/dictionaries/landing.es"

interface MobileDockProps {
  locale: Locale
  t: LandingDictionary["nav"]
}

export function MobileDock({ locale, t }: MobileDockProps) {
  const home = `/${locale}`

  const items = [
    { href: `${home}#hero`, label: "Círculo", icon: CircleDot },
    { href: `${home}#como-funciona`, label: t.how, icon: Zap },
    { href: `${home}#seguridad`, label: t.safety, icon: ShieldCheck },
    { href: `${home}#preguntas-frecuentes`, label: "FAQ", icon: HelpCircle },
  ]

  return (
    <aside
      aria-label="Navegación móvil rápida"
      className="fixed inset-x-3 bottom-3 z-40 block pb-[max(0.25rem,env(safe-area-inset-bottom))] md:hidden"
    >
      <nav className="mx-auto flex max-w-md items-center justify-between gap-1 rounded-full border border-white/15 bg-brand-navy/92 px-2.5 py-1.5 shadow-[0_16px_40px_-10px_rgba(16,24,40,0.65)] backdrop-blur-xl">
        <div className="flex items-center gap-0.5 sm:gap-1">
          {items.map(({ href, label, icon: Icon }) => (
            <a
              key={href}
              href={href}
              className="flex flex-col items-center justify-center rounded-full px-2.5 py-1 text-[10px] font-medium text-brand-on-navy outline-none transition-all duration-150 hover:text-brand-white focus-visible:ring-2 focus-visible:ring-brand-mint active:scale-90"
            >
              <Icon className="size-4 shrink-0" />
              <span className="mt-0.5 max-w-[50px] truncate tracking-tight">{label}</span>
            </a>
          ))}
        </div>

        {/* Primary App CTA Action */}
        <Link
          href={`/${locale}/circles`}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-brand-mint px-3.5 text-xs font-bold text-brand-navy shadow-xs outline-none transition-transform duration-150 hover:opacity-95 focus-visible:ring-2 focus-visible:ring-brand-violet active:scale-95"
        >
          <Sparkles className="size-3 text-brand-navy" />
          <span>Demo</span>
        </Link>
      </nav>
    </aside>
  )
}
