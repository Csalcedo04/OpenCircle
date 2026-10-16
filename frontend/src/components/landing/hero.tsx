import Link from "next/link"
import type { Locale } from "@/i18n/config"
import type { LandingDictionary } from "@/i18n/dictionaries/landing.es"
import { HeroDashboard } from "./hero-dashboard"
import { TrustTicker } from "./trust-ticker"
import { cta } from "./shared"

export function Hero({ t, trust, locale }: { t: LandingDictionary["hero"]; trust: LandingDictionary["trust"]; locale: Locale }) {
  return (
    <section id="hero" aria-labelledby="hero-title" className="relative isolate overflow-hidden scroll-mt-16">
      {/* Orbital Constellation SVG background */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-20 -z-10 h-[48rem] overflow-hidden opacity-30 select-none">
        <svg viewBox="0 0 1440 800" fill="none" className="h-full w-full">
          <circle cx="1120" cy="300" r="260" stroke="var(--color-brand-line)" strokeWidth="1.5" strokeDasharray="5 7" />
          <circle cx="1120" cy="300" r="420" stroke="color-mix(in srgb, var(--color-brand-violet) 25%, transparent)" strokeWidth="1" />
          <circle cx="240" cy="180" r="220" stroke="color-mix(in srgb, var(--color-brand-mint) 50%, transparent)" strokeWidth="1.5" strokeDasharray="4 6" />
          <path d="M 50 480 Q 720 120 1380 420" stroke="color-mix(in srgb, var(--color-brand-violet) 20%, transparent)" strokeWidth="1.5" />
          <path d="M 200 620 Q 900 350 1420 600" stroke="color-mix(in srgb, var(--color-brand-navy) 10%, transparent)" strokeWidth="1" strokeDasharray="6 8" />
        </svg>
      </div>

      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-x-12 gap-y-12 px-4 pt-8 pb-12 sm:px-6 sm:pt-14 sm:pb-16 lg:grid-cols-[1.02fr_1fr] lg:px-8 lg:pt-14 lg:pb-20">
        <div className="oc-rise">
          {/* Institutional Dot Eyebrow */}
          <p className="inline-flex items-center gap-2 rounded-full border border-brand-line bg-brand-white px-3.5 py-1.5 text-[11px] sm:text-xs font-bold uppercase tracking-wider text-brand-navy shadow-2xs">
            <span className="size-2 rounded-full bg-brand-violet animate-pulse" aria-hidden="true" />
            {t.eyebrow}
          </p>

          <h1
            id="hero-title"
            className="mt-5 text-[2.1rem] leading-[1.05] font-semibold tracking-[-0.04em] text-balance text-brand-navy break-words sm:text-5xl lg:text-[4.2rem]"
          >
            {t.titleStart}
            <span className="bg-[linear-gradient(transparent_68%,color-mix(in_srgb,var(--color-brand-mint)_85%,transparent)_68%,color-mix(in_srgb,var(--color-brand-mint)_85%,transparent)_92%,transparent_92%)] box-decoration-clone text-brand-violet-ink">
              {t.titleHighlight}
            </span>
          </h1>

          <p className="mt-5 max-w-xl text-base leading-relaxed text-pretty text-brand-slate sm:text-lg lg:text-xl">{t.lead}</p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row w-full sm:w-auto">
            <Link href={`/${locale}/circles`} className={`${cta.primary} w-full sm:w-auto`}>
              {t.primary}
            </Link>
            <a href="#como-funciona" className={`${cta.secondary} w-full sm:w-auto`}>
              {t.secondary}
            </a>
          </div>

          <p className="mt-4 text-xs sm:text-sm font-medium text-brand-navy/80">{t.micro}</p>
        </div>

        <HeroDashboard t={t.dashboard} locale={locale} />
      </div>

      <TrustTicker trust={trust} />
    </section>
  )
}
