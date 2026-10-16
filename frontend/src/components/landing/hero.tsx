import Link from "next/link"
import { Check, Sparkles } from "lucide-react"
import type { Locale } from "@/i18n/config"
import type { LandingDictionary } from "@/i18n/dictionaries/landing.es"
import { HeroDashboard } from "./hero-dashboard"
import { cta } from "./shared"

export function Hero({ t, trust, locale }: { t: LandingDictionary["hero"]; trust: LandingDictionary["trust"]; locale: Locale }) {
  return (
    <section aria-labelledby="hero-title" className="relative isolate">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 -top-16 -z-10 h-[38rem] bg-[radial-gradient(45%_60%_at_85%_10%,color-mix(in_srgb,var(--color-brand-violet)_10%,transparent),transparent_70%),radial-gradient(35%_50%_at_10%_0%,color-mix(in_srgb,var(--color-brand-mint)_45%,transparent),transparent_70%)]"
      />
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-x-12 gap-y-16 px-4 pt-10 pb-16 sm:px-6 sm:pt-14 lg:grid-cols-[1.02fr_1fr] lg:px-8 lg:pt-14 lg:pb-20">
        <div className="oc-rise">
          <p className="inline-flex items-center gap-2 rounded-full border border-brand-line bg-brand-white px-3.5 py-1.5 text-[13px] font-medium text-brand-navy">
            <Sparkles className="size-3.5 text-brand-violet" aria-hidden="true" />
            {t.eyebrow}
          </p>
          <h1
            id="hero-title"
            className="mt-6 text-[2.6rem] leading-[1.02] font-semibold tracking-[-0.04em] text-balance sm:text-6xl lg:text-[4.4rem]"
          >
            {t.titleStart}
            <span className="bg-[linear-gradient(transparent_68%,color-mix(in_srgb,var(--color-brand-mint)_85%,transparent)_68%,color-mix(in_srgb,var(--color-brand-mint)_85%,transparent)_92%,transparent_92%)] box-decoration-clone text-brand-violet-ink">
              {t.titleHighlight}
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-pretty text-brand-slate sm:text-xl">{t.lead}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href={`/${locale}/circles`} className={cta.primary}>
              {t.primary}
            </Link>
            <a href="#como-funciona" className={cta.secondary}>
              {t.secondary}
            </a>
          </div>
          <p className="mt-5 text-sm font-medium text-brand-navy/80">{t.micro}</p>
        </div>

        <HeroDashboard t={t.dashboard} locale={locale} />
      </div>

      <div className="border-y border-brand-line bg-brand-white/70">
        <ul className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-4 py-5 sm:justify-between sm:px-6 lg:px-8">
          {trust.map((item) => (
            <li key={item} className="flex items-center gap-2.5 text-[15px] font-medium">
              <span className="grid size-6 place-items-center rounded-full bg-brand-mint">
                <Check className="size-3.5 text-brand-navy" strokeWidth={3} aria-hidden="true" />
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
