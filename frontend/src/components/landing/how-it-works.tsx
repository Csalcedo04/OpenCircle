import type { ReactNode } from "react"
import { Link2 } from "lucide-react"
import type { Locale } from "@/i18n/config"
import type { LandingDictionary } from "@/i18n/dictionaries/landing.es"
import { estimateCircle } from "@/lib/domain/calculator"
import { Avatar, PEOPLE, SectionHeading, pesos } from "./shared"

type T = LandingDictionary["how"]

export function HowItWorks({ t, locale, circleName }: { t: T; locale: Locale; circleName: string }) {
  const { payout } = estimateCircle(5, 20_000n, 200)
  const vignettes: ReactNode[] = [
    <div key="create" className="space-y-2">
      <Field label={t.mock.name} value={`$ilp.rafiki.money/${circleName}`} />
      <Field label={t.mock.amount} value={pesos(20_000, locale)} />
    </div>,
    <div key="invite" className="space-y-3">
      <div className="flex -space-x-2">
        {PEOPLE.map((p) => (
          <Avatar key={p.name} name={p.name} tone={p.tone} size="sm" photo className="ring-2 ring-brand-white" />
        ))}
      </div>
      <p className="flex items-center gap-2 rounded-xl bg-brand-white px-3 py-2 text-xs font-medium">
        <Link2 className="size-3.5 text-brand-violet-ink" />
        {t.mock.invite}
        <span className="ml-auto rounded-full bg-brand-mint px-2 py-0.5 text-[10px] font-semibold">{t.mock.copied}</span>
      </p>
    </div>,
    <div key="pay" className="space-y-2.5">
      <div className="flex items-center justify-between text-xs font-semibold">
        <span>{t.mock.gnapConsent}</span>
        <span className="text-brand-violet-ink">{t.mock.gnapReady}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-brand-white">
        <div className="oc-reveal h-full w-full rounded-full bg-brand-violet" />
      </div>
      <div className="flex items-center justify-between gap-1.5 pt-1 text-[11px] text-brand-navy/70">
        <span>{t.mock.debitAuthorized}</span>
        <span className="font-semibold text-brand-navy">{t.mock.verified}</span>
      </div>
    </div>,
    <div key="receive" className="rounded-2xl bg-brand-navy p-3.5 text-brand-white">
      <div className="flex items-center justify-between text-[11px] text-brand-on-navy">
        <span>{t.mock.received}</span>
        <span className="rounded-full bg-brand-mint/20 px-2 py-0.5 text-[10px] text-brand-mint">Rafiki ILP</span>
      </div>
      <p className="mt-1 text-xl font-semibold tracking-[-0.02em] text-brand-mint tabular-nums">{pesos(payout, locale)}</p>
    </div>,
  ]

  return (
    <section id="como-funciona" aria-labelledby="como-funciona-title" className="scroll-mt-20 bg-brand-white py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading id="como-funciona-title" title={t.title} lead={t.lead} />
        <ol className="relative mt-14 -mx-4 flex gap-4 overflow-x-auto px-4 pb-4 snap-x snap-mandatory scrollbar-none md:mx-0 md:grid md:grid-cols-2 md:gap-5 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-4">
          {/* connector (desktop only) */}
          <span aria-hidden="true" className="absolute top-6 right-[12.5%] left-[12.5%] hidden h-px bg-[linear-gradient(90deg,var(--color-brand-violet),var(--color-brand-mint))] lg:block" />
          {t.steps.map((step, i) => (
            <li key={step.title} className="oc-reveal relative flex flex-col shrink-0 w-[82vw] sm:w-[60vw] snap-center md:w-auto md:shrink md:snap-align-none">
              <span className="relative z-10 mx-0 grid size-12 place-items-center rounded-full border border-brand-line bg-brand-white text-sm font-semibold tabular-nums shadow-[0_6px_16px_-10px_color-mix(in_srgb,var(--color-brand-navy)_50%,transparent)] lg:mx-auto">
                <span className="bg-[linear-gradient(135deg,var(--color-brand-violet-ink),var(--color-brand-navy))] bg-clip-text text-transparent">{String(i + 1).padStart(2, "0")}</span>
              </span>
              <div className="mt-5 flex flex-1 flex-col rounded-[32px] border border-brand-line bg-brand-canvas p-6">
                <div aria-hidden="true" className="flex h-36 flex-col justify-center rounded-2xl bg-brand-mist p-4">
                  {vignettes[i]}
                </div>
                <h3 className="mt-5 text-lg font-semibold tracking-[-0.01em]">{step.title}</h3>
                <p className="mt-1.5 leading-relaxed text-brand-slate">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-brand-white px-3 py-2">
      <p className="text-[10px] font-medium text-brand-slate">{label}</p>
      <p className="truncate text-sm font-semibold">{value}</p>
    </div>
  )
}
