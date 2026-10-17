"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { CircleDot, HelpCircle, ShieldCheck, Sparkles, Zap } from "lucide-react"
import type { Locale } from "@/i18n/config"
import type { LandingDictionary } from "@/i18n/dictionaries/landing.es"
import { cn } from "@/lib/utils"

interface MobileDockProps {
  locale: Locale
  t: LandingDictionary["nav"]
}

const SECTION_IDS = ["hero", "como-funciona", "seguridad", "preguntas-frecuentes"] as const
type SectionId = (typeof SECTION_IDS)[number]

export function MobileDock({ locale, t }: MobileDockProps) {
  const home = `/${locale}`
  const [activeSection, setActiveSection] = useState<SectionId>("hero")

  useEffect(() => {
    const elements = SECTION_IDS.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => el !== null,
    )
    if (elements.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id as SectionId)
          }
        }
      },
      { rootMargin: "-35% 0px -50% 0px", threshold: 0 },
    )

    for (const el of elements) observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const leftItems: ReadonlyArray<{ id: SectionId; href: string; label: string; icon: typeof CircleDot }> = [
    { id: "hero", href: `${home}#hero`, label: t.circleMobile, icon: CircleDot },
    { id: "como-funciona", href: `${home}#como-funciona`, label: t.howMobile, icon: Zap },
  ]

  const rightItems: ReadonlyArray<{ id: SectionId; href: string; label: string; icon: typeof CircleDot }> = [
    { id: "seguridad", href: `${home}#seguridad`, label: t.safetyMobile, icon: ShieldCheck },
    { id: "preguntas-frecuentes", href: `${home}#preguntas-frecuentes`, label: "FAQ", icon: HelpCircle },
  ]

  const renderAnchor = ({
    id,
    href,
    label,
    icon: Icon,
  }: {
    id: SectionId
    href: string
    label: string
    icon: typeof CircleDot
  }) => {
    const isActive = activeSection === id
    return (
      <a
        key={id}
        href={href}
        onClick={() => setActiveSection(id)}
        className="group flex min-h-12 flex-col items-center justify-center gap-1 rounded-2xl py-0.5 outline-none transition-transform duration-150 active:scale-95 focus-visible:ring-2 focus-visible:ring-brand-mint"
      >
        <span
          className={cn(
            "flex h-7 w-10 items-center justify-center rounded-full transition-colors duration-150",
            isActive
              ? "bg-brand-mint/20 text-brand-mint"
              : "text-brand-on-navy group-hover:text-brand-white",
          )}
        >
          <Icon
            className={cn("size-4 shrink-0", isActive ? "stroke-[2.5px]" : "stroke-2")}
            aria-hidden="true"
          />
        </span>
        <span
          className={cn(
            "max-w-[62px] truncate text-[10px] leading-none tracking-tight transition-colors",
            isActive ? "font-bold text-brand-mint" : "font-medium text-brand-on-navy group-hover:text-brand-white",
          )}
        >
          {label}
        </span>
      </a>
    )
  }

  return (
    <aside
      aria-label={t.quickNavAria}
      className="fixed inset-x-3 bottom-3 z-40 block pb-[max(0.25rem,env(safe-area-inset-bottom))] md:hidden"
    >
      <nav className="mx-auto grid max-w-md grid-cols-5 items-end rounded-3xl border border-brand-white/15 bg-brand-navy/95 px-2 pt-1.5 pb-2 shadow-[0_16px_40px_-10px_color-mix(in_srgb,var(--color-brand-navy)_65%,transparent)] backdrop-blur-xl">
        {leftItems.map(renderAnchor)}

        {/* Central App Launcher CTA (elevated circular button in center) */}
        <Link
          href={`/${locale}/circles`}
          aria-label={t.cta}
          className="group flex flex-col items-center justify-end rounded-2xl pb-0.5 outline-none focus-visible:ring-2 focus-visible:ring-brand-mint"
        >
          <span className="-mt-5 flex size-12 items-center justify-center rounded-full bg-brand-mint text-brand-navy ring-4 ring-brand-navy shadow-[0_10px_24px_-6px_color-mix(in_srgb,var(--color-brand-mint)_55%,transparent)] transition-transform duration-150 group-hover:scale-105 group-active:scale-95">
            <Sparkles className="size-5 stroke-[2.25px]" aria-hidden="true" />
          </span>
          <span className="mt-1 text-[10px] font-bold leading-none tracking-tight text-brand-mint">
            {t.demoMobile}
          </span>
        </Link>

        {rightItems.map(renderAnchor)}
      </nav>
    </aside>
  )
}
