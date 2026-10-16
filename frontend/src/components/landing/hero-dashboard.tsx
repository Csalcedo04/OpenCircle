import { Check, CircleCheck, Clock } from "lucide-react"
import { fill, type Locale } from "@/i18n/config"
import type { LandingDictionary } from "@/i18n/dictionaries/landing.es"
import { estimateCircle } from "@/lib/domain/calculator"
import { cn } from "@/lib/utils"
import { Avatar, PEOPLE, pesos, pesosLabel } from "./shared"

const CONTRIBUTION = 20_000n
const CONFIRMED = 4

/**
 * The product, not an illustration: a static render of the circle dashboard
 * with sample data. Motion is CSS-only and stops under reduced motion.
 */
export function HeroDashboard({ t, locale }: { t: LandingDictionary["hero"]["dashboard"]; locale: Locale }) {
  const { total } = estimateCircle(PEOPLE.length, CONTRIBUTION, 0)
  const pct = Math.round((CONFIRMED * 100) / PEOPLE.length)
  // Juan is the one still pending; Andrés receives this round; Carlos is next.
  const order = [PEOPLE[0], PEOPLE[1], PEOPLE[2], PEOPLE[3], PEOPLE[4]]
  const activity = [PEOPLE[0], PEOPLE[3], PEOPLE[2], PEOPLE[1]]

  return (
    <figure aria-label={t.label} className="relative mx-auto mb-10 w-full max-w-[34rem] lg:mx-0 lg:ml-auto">
      {/* Soft light behind the card */}
      <div
        aria-hidden="true"
        className="absolute -inset-x-6 -inset-y-10 -z-10 rounded-[48px] bg-[radial-gradient(60%_55%_at_70%_30%,color-mix(in_srgb,var(--color-brand-violet)_18%,transparent),transparent_70%),radial-gradient(50%_50%_at_25%_80%,color-mix(in_srgb,var(--color-brand-mint)_60%,transparent),transparent_70%)] blur-2xl"
      />

      <div className="oc-rise rounded-[40px] border border-brand-line bg-brand-white p-5 pb-16 shadow-[0_30px_60px_-30px_color-mix(in_srgb,var(--color-brand-navy)_35%,transparent)] sm:p-7 sm:pb-16">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] font-medium text-brand-slate">{t.heading}</p>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-mint px-2.5 py-1 text-[11px] font-semibold text-brand-navy">
            <span aria-hidden="true" className="oc-pulse size-1.5 rounded-full bg-brand-navy" />
            {t.status}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[1.35rem] font-semibold tracking-[-0.02em] sm:text-2xl">{t.circle}</p>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-mist px-3 py-1 text-[11px] font-medium text-brand-navy/80">
            <span className="size-1.5 rounded-full bg-brand-violet" aria-hidden="true" />
            $ilp.rafiki.money/viaje
          </span>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          <div className="rounded-2xl bg-brand-mist p-3.5">
            <dt className="text-[11px] font-medium text-brand-navy/70">{t.contribution}</dt>
            <dd className="mt-1 text-[15px] font-semibold tabular-nums">{pesosLabel(CONTRIBUTION, locale)}</dd>
          </div>
          <div className="rounded-2xl bg-brand-mist p-3.5">
            <dt className="text-[11px] font-medium text-brand-navy/70">{t.participants}</dt>
            <dd className="mt-1 text-[15px] font-semibold">{fill(t.people, { count: PEOPLE.length })}</dd>
          </div>
          <div className="col-span-2 rounded-2xl bg-brand-navy p-3.5 text-brand-white sm:col-span-1">
            <dt className="text-[11px] font-medium text-brand-on-navy">{t.pool}</dt>
            <dd className="mt-1 text-[15px] font-semibold text-brand-mint tabular-nums">{pesosLabel(total, locale)}</dd>
          </div>
        </dl>

        <div className="mt-5">
          <div className="flex items-baseline justify-between text-[13px]">
            <p className="font-medium">{fill(t.progress, { confirmed: CONFIRMED, total: PEOPLE.length })}</p>
            <p className="font-semibold tabular-nums text-brand-violet-ink">{pct}%</p>
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={PEOPLE.length}
            aria-valuenow={CONFIRMED}
            aria-label={fill(t.progress, { confirmed: CONFIRMED, total: PEOPLE.length })}
            className="mt-2 h-2.5 overflow-hidden rounded-full bg-brand-mist"
          >
            <div
              className="oc-fill h-full rounded-full bg-[linear-gradient(90deg,var(--color-brand-violet),color-mix(in_srgb,var(--color-brand-violet)_70%,var(--color-brand-mint)))] [animation-delay:300ms]"
              style={{ width: `${pct}%` }}
            />
          </div>
          <ul className="mt-4 flex items-center gap-2" aria-hidden="true">
            {order.map((p, i) => {
              const paid = i < CONFIRMED - 1 || i === 3
              const pending = i === 4
              return (
                <li key={p.name} className="relative">
                  <Avatar name={p.name} tone={p.tone} size="lg" className={cn(pending && "border-2 border-dashed border-brand-slate bg-brand-white ring-0")} />
                  {paid && !pending && (
                    <span className="absolute -right-0.5 -bottom-0.5 grid size-4 place-items-center rounded-full bg-brand-mint ring-2 ring-brand-white">
                      <Check className="size-2.5 text-brand-navy" strokeWidth={3.5} />
                    </span>
                  )}
                </li>
              )
            })}
            <li className="ml-auto text-right text-[11px] leading-tight text-brand-slate">
              {t.receives}
              <span className="block text-[13px] font-semibold text-brand-navy">Andrés</span>
            </li>
          </ul>
        </div>

        <div className="mt-5 border-t border-brand-line pt-4">
          <p className="text-[13px] font-medium text-brand-slate">{t.activity}</p>
          <ul className="mt-2 divide-y divide-brand-line">
            {activity.map((p, i) => (
              <li key={p.name} className={cn("flex items-center gap-3 py-2.5", i > 2 && "hidden")}>
                <Avatar name={p.name} tone={p.tone} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold">{p.name}</p>
                  <p className="flex items-center gap-1 text-[11px] text-brand-slate">
                    <CircleCheck className="size-3 text-brand-violet-ink" aria-hidden="true" />
                    {t.confirmed} · {t.times[i]}
                  </p>
                </div>
                <p className="text-[13px] font-semibold tabular-nums">+{pesos(CONTRIBUTION, locale)}</p>
              </li>
            ))}
            <li className="flex items-center gap-3 py-2.5">
              <Avatar name="Juan" tone="line" size="sm" className="border border-dashed border-brand-slate ring-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold">Juan</p>
                <p className="flex items-center gap-1 text-[11px] text-brand-slate">
                  <Clock className="size-3" aria-hidden="true" />
                  {t.pending}
                </p>
              </div>
              <p className="text-[13px] font-medium text-brand-slate tabular-nums">{pesos(CONTRIBUTION, locale)}</p>
            </li>
          </ul>
        </div>
        <figcaption className="mt-3 text-right text-[11px] text-brand-slate">{t.sample}</figcaption>
      </div>

      {/* Floating notifications */}
      <div className="oc-pop absolute -bottom-5 left-3 [animation-delay:900ms] sm:-bottom-6 sm:-left-10">
        <div className="oc-bob flex items-center gap-2.5 rounded-2xl border border-brand-line bg-brand-white/95 py-2.5 pr-4 pl-2.5 shadow-[0_16px_40px_-20px_color-mix(in_srgb,var(--color-brand-navy)_40%,transparent)] backdrop-blur">
          <span className="grid size-7 place-items-center rounded-full bg-brand-mint">
            <Check className="size-4 text-brand-navy" strokeWidth={3} aria-hidden="true" />
          </span>
          <p className="text-[13px] font-semibold">{t.notifyPaid}</p>
        </div>
      </div>
      <div className="oc-pop absolute right-3 -bottom-12 [animation-delay:1400ms] sm:-right-6 sm:-bottom-14">
        <div className="oc-bob flex items-center gap-2.5 rounded-2xl bg-brand-navy py-2.5 pr-4 pl-2.5 text-brand-white shadow-[0_16px_40px_-18px_color-mix(in_srgb,var(--color-brand-navy)_60%,transparent)] [animation-delay:-3s]">
          <Avatar name="Carlos" tone="mint" size="sm" />
          <p className="text-[13px] font-semibold">{t.notifyNext}</p>
        </div>
      </div>
    </figure>
  )
}
