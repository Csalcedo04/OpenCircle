import Link from "next/link"
import type { Locale } from "@/i18n/config"
import type { LandingDictionary } from "@/i18n/dictionaries/landing.es"

export function FinalCta({ t, locale }: { t: LandingDictionary["finalCta"]; locale: Locale }) {
  return (
    <section aria-labelledby="cta-title" className="px-3 pb-3 sm:px-4 sm:pb-4">
      <div className="relative isolate mx-auto max-w-[96rem] overflow-hidden rounded-[32px] bg-brand-navy px-5 py-24 text-center text-brand-white sm:py-32">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[radial-gradient(40%_60%_at_20%_100%,color-mix(in_srgb,var(--color-brand-violet)_45%,transparent),transparent_70%),radial-gradient(35%_50%_at_85%_0%,color-mix(in_srgb,var(--color-brand-mint)_22%,transparent),transparent_70%)]"
        />
        {/* Concentric rings: the circle, quietly */}
        <svg aria-hidden="true" viewBox="0 0 800 800" className="absolute top-1/2 left-1/2 -z-10 w-[56rem] max-w-none -translate-x-1/2 -translate-y-1/2 opacity-[0.12]">
          {[120, 200, 280, 360].map((r) => (
            <circle key={r} cx="400" cy="400" r={r} fill="none" className="stroke-brand-white" strokeWidth="1" />
          ))}
        </svg>

        <h2 id="cta-title" className="mx-auto max-w-4xl text-[2.4rem] leading-[1.02] font-semibold tracking-[-0.04em] text-balance sm:text-6xl lg:text-7xl">
          {t.title}
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-brand-on-navy sm:text-xl">{t.lead}</p>
        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href={`/${locale}/circles`}
            className="inline-flex h-12 items-center justify-center rounded-full bg-brand-mint px-7 text-[15px] font-semibold text-brand-navy outline-none transition-transform duration-200 hover:-translate-y-0.5 focus-visible:ring-4 focus-visible:ring-brand-mint/40 motion-reduce:hover:translate-y-0"
          >
            {t.primary}
          </Link>
          <Link
            href={`/${locale}/circles/new`}
            className="inline-flex h-12 items-center justify-center rounded-full border border-brand-white/25 px-7 text-[15px] font-semibold text-brand-white outline-none transition-colors hover:bg-brand-white/10 focus-visible:ring-4 focus-visible:ring-brand-mint/40"
          >
            {t.secondary}
          </Link>
        </div>
        <p className="mx-auto mt-10 max-w-md text-sm text-brand-on-navy">{t.note}</p>
      </div>
    </section>
  )
}
