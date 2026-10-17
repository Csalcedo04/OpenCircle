import { ArrowDown, ArrowUpRight, CheckCircle2, Coins, ListOrdered, ShieldCheck, TrendingUp } from "lucide-react"
import { fill } from "@/i18n/config"
import type { LandingDictionary } from "@/i18n/dictionaries/landing.es"
import { Avatar, PEOPLE, SectionHeading } from "./shared"

// Sample scores for the payout-order mockup (ICS 0–100; a newcomer has none yet).
const RANKING = [
  { person: PEOPLE[0], score: 92 },
  { person: PEOPLE[2], score: 81 },
  { person: PEOPLE[1], score: null },
] as const

export function UseCases({ t }: { t: LandingDictionary["useCases"] }) {
  const [savings, order, safety] = t.cards

  return (
    <section aria-labelledby="soluciones-title" className="py-16 sm:py-24 bg-brand-canvas/60">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <SectionHeading id="soluciones-title" title={t.title} lead={t.lead}>
            <p className="mt-4 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-brand-slate">
              <span className="size-2 rounded-full bg-brand-violet" aria-hidden="true" />
              {t.eyebrow}
            </p>
          </SectionHeading>
          <div className="hidden lg:flex items-center gap-2 rounded-full border border-brand-line bg-brand-white px-4 py-2 text-xs font-semibold text-brand-navy shadow-xs">
            <ShieldCheck className="size-4 text-brand-violet" />
            {t.openProtocolBadge}
          </div>
        </div>

        {/* Asymmetric Bento Architecture (Horizontal Snap on Mobile, Bento on Desktop) */}
        <div className="mt-10 sm:mt-14 -mx-4 flex gap-4 overflow-x-auto px-4 pb-4 snap-x snap-mandatory scrollbar-none md:mx-0 md:grid md:grid-cols-1 md:gap-6 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-12">
          {/* Card 1: Collaborative Savings (7 cols) */}
          {savings && (
            <article className="oc-reveal relative flex flex-col justify-between overflow-hidden rounded-[32px] sm:rounded-[40px] border border-brand-line bg-brand-white p-6 sm:p-9 shadow-xs shrink-0 w-[88vw] sm:w-[75vw] snap-center md:w-auto md:shrink md:snap-align-none lg:col-span-7">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-mist px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-brand-navy/80">
                    <Coins className="size-3.5 text-brand-violet" />
                    {savings.tag}
                  </span>
                  <h3 className="mt-3 text-xl sm:text-2xl lg:text-3xl font-semibold tracking-[-0.02em] text-brand-navy">
                    {savings.title}
                  </h3>
                </div>
                {/* Micro-CTA satellite */}
                <span className="grid size-10 sm:size-11 shrink-0 place-items-center rounded-full border border-brand-line bg-brand-canvas text-brand-navy shadow-xs transition-transform duration-200 hover:scale-105">
                  <ArrowUpRight className="size-4 sm:size-5" />
                </span>
              </div>

              <p className="mt-4 text-sm sm:text-base leading-relaxed text-brand-slate">{savings.body}</p>

              {/* Technical proof preview */}
              <div className="mt-6 sm:mt-8 rounded-[24px] sm:rounded-[28px] border border-brand-line bg-brand-mist/50 p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs font-semibold">
                  <span className="text-brand-navy">{t.mockSavings.heading}</span>
                  <span className="font-mono text-brand-violet-ink">{savings.metric}</span>
                </div>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 text-center">
                  <div className="rounded-2xl bg-brand-white p-3 shadow-2xs">
                    <p className="text-[10px] uppercase font-bold text-brand-slate">{t.mockSavings.frequencyLabel}</p>
                    <p className="mt-1 text-xs sm:text-sm font-semibold text-brand-navy">{t.mockSavings.frequencyValue}</p>
                  </div>
                  <div className="rounded-2xl bg-brand-white p-3 shadow-2xs">
                    <p className="text-[10px] uppercase font-bold text-brand-slate">{t.mockSavings.orderLabel}</p>
                    <p className="mt-1 text-xs sm:text-sm font-semibold text-brand-navy">{t.mockSavings.orderValue}</p>
                  </div>
                  <div className="rounded-2xl bg-brand-white p-3 shadow-2xs">
                    <p className="text-[10px] uppercase font-bold text-brand-slate">{t.mockSavings.approvalLabel}</p>
                    <p className="mt-1 text-xs sm:text-sm font-semibold text-brand-navy">{t.mockSavings.approvalValue}</p>
                  </div>
                </div>
              </div>
            </article>
          )}

          {/* Card 2: Payout order by reliability score (5 cols) */}
          {order && (
            <article className="oc-reveal relative flex flex-col justify-between overflow-hidden rounded-[32px] sm:rounded-[40px] border border-brand-line bg-brand-white p-6 sm:p-9 shadow-xs shrink-0 w-[88vw] sm:w-[75vw] snap-center md:w-auto md:shrink md:snap-align-none lg:col-span-5">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-mist px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-brand-navy/80">
                    <ListOrdered className="size-3.5 text-brand-violet" />
                    {order.tag}
                  </span>
                  <h3 className="mt-3 text-xl sm:text-2xl lg:text-3xl font-semibold tracking-[-0.02em] text-brand-navy">
                    {order.title}
                  </h3>
                </div>
                <span className="grid size-10 sm:size-11 shrink-0 place-items-center rounded-full border border-brand-line bg-brand-canvas text-brand-navy shadow-xs transition-transform duration-200 hover:scale-105">
                  <ArrowUpRight className="size-4 sm:size-5" />
                </span>
              </div>

              <p className="mt-4 text-sm sm:text-base leading-relaxed text-brand-slate">{order.body}</p>

              {/* Ranked payout order */}
              <div className="mt-6 sm:mt-8 rounded-[24px] sm:rounded-[28px] border border-brand-line bg-brand-navy p-4 sm:p-5 text-brand-white">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] sm:text-[11px] text-brand-on-navy">{t.mockOrder.heading}</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-mint px-2 py-0.5 text-[9px] sm:text-[10px] font-bold text-brand-navy">
                    <TrendingUp className="size-2.5 sm:size-3" />
                    {order.metric}
                  </span>
                </div>
                <ol className="mt-3 space-y-2">
                  {RANKING.map(({ person, score }, i) => (
                    <li key={person.name} className="flex items-center gap-3 text-xs sm:text-sm">
                      <span className="w-14 shrink-0 text-[11px] text-brand-on-navy">{fill(t.mockOrder.round, { n: i + 1 })}</span>
                      <Avatar name={person.name} tone={person.tone} size="sm" photo />
                      <span className="flex-1 font-semibold">{person.name}</span>
                      <span className="font-mono text-brand-mint tabular-nums">{score ?? t.mockOrder.newcomer}</span>
                    </li>
                  ))}
                </ol>
                <div className="mt-3 flex items-center justify-between border-t border-brand-white/10 pt-2 text-[10px] sm:text-[11px] text-brand-on-navy">
                  <span>{t.mockOrder.note}</span>
                  <span className="text-brand-white font-semibold">{t.mockOrder.agreed}</span>
                </div>
              </div>
            </article>
          )}

          {/* Card 3: Protected payouts (12 cols) */}
          {safety && (
            <article className="oc-reveal relative overflow-hidden rounded-[32px] sm:rounded-[40px] border border-brand-line bg-brand-white p-6 sm:p-9 shadow-xs shrink-0 w-[88vw] sm:w-[75vw] snap-center md:w-auto md:shrink md:snap-align-none lg:col-span-12">
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
                <div className="lg:col-span-6 space-y-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-mist px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-brand-navy/80">
                    <ShieldCheck className="size-3.5 text-brand-violet" />
                    {safety.tag}
                  </span>
                  <h3 className="text-xl sm:text-2xl lg:text-3xl font-semibold tracking-[-0.02em] text-brand-navy">
                    {safety.title}
                  </h3>
                  <p className="text-sm sm:text-base leading-relaxed text-brand-slate max-w-xl">{safety.body}</p>
                  <div className="pt-2 flex flex-col sm:flex-row gap-2 sm:gap-4">
                    {t.mockSafety.checks.map((check) => (
                      <span key={check} className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-navy">
                        <CheckCircle2 className="size-4 text-brand-violet shrink-0" />
                        {check}
                      </span>
                    ))}
                  </div>
                </div>

                {/* One round: contributions → coverage check → payout */}
                <div className="lg:col-span-6 rounded-[24px] sm:rounded-[32px] border border-brand-line bg-brand-mist/60 p-4 sm:p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs font-mono font-medium text-brand-navy/70">
                    <span className="uppercase">{t.mockSafety.heading}</span>
                    <span className="text-brand-violet-ink font-semibold">{safety.metric}</span>
                  </div>

                  <ol className="mt-4 sm:mt-5 grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 items-stretch">
                    {t.mockSafety.steps.map((step, i) => (
                      <li key={step.label} className="relative rounded-2xl border border-brand-line bg-brand-white p-3 text-center">
                        <p className="text-[10px] uppercase font-bold text-brand-slate">{step.label}</p>
                        <p className="mt-1 text-xs sm:text-sm font-semibold text-brand-navy">{step.value}</p>
                        {i < t.mockSafety.steps.length - 1 && (
                          <ArrowDown className="mx-auto mt-2 size-4 text-brand-violet sm:hidden" aria-hidden="true" />
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </article>
          )}
        </div>
      </div>
    </section>
  )
}
