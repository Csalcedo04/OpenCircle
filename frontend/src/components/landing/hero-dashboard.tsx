"use client"

import { useState } from "react"
import { Check, CircleCheck, Clock, RefreshCw, ShieldCheck, Zap } from "lucide-react"
import { fill, type Locale } from "@/i18n/config"
import type { LandingDictionary } from "@/i18n/dictionaries/landing.es"
import { estimateCircle } from "@/lib/domain/calculator"
import { cn } from "@/lib/utils"
import { Avatar, PEOPLE, pesos, pesosLabel } from "./shared"

const CONTRIBUTION = 20_000n

export function HeroDashboard({ t, locale }: { t: LandingDictionary["hero"]["dashboard"]; locale: Locale }) {
  const [isSimulating, setIsSimulating] = useState(false)
  const [completedJuan, setCompletedJuan] = useState(false)

  const confirmedCount = completedJuan ? 5 : 4
  const { total } = estimateCircle(PEOPLE.length, CONTRIBUTION, 0)
  const pct = Math.round((confirmedCount * 100) / PEOPLE.length)

  const order = [PEOPLE[0], PEOPLE[1], PEOPLE[2], PEOPLE[3], PEOPLE[4]]
  const activity = [PEOPLE[0], PEOPLE[3], PEOPLE[2], PEOPLE[1]]

  const handleSimulatePayment = () => {
    if (completedJuan) {
      setCompletedJuan(false)
      return
    }
    setIsSimulating(true)
    setTimeout(() => {
      setCompletedJuan(true)
      setIsSimulating(false)
    }, 600)
  }

  return (
    <figure aria-label={t.label} className="relative mx-auto mb-6 sm:mb-10 w-full max-w-[34rem] lg:mx-0 lg:ml-auto">
      {/* Subtle orbital aura */}
      <div
        aria-hidden="true"
        className="absolute -inset-x-4 -inset-y-6 sm:-inset-x-6 sm:-inset-y-10 -z-10 rounded-[48px] bg-[radial-gradient(60%_55%_at_70%_30%,color-mix(in_srgb,var(--color-brand-violet)_12%,transparent),transparent_70%),radial-gradient(50%_50%_at_25%_80%,color-mix(in_srgb,var(--color-brand-mint)_50%,transparent),transparent_70%)] blur-2xl"
      />

      <div className="oc-rise rounded-[32px] sm:rounded-[40px] border border-brand-line bg-brand-white p-4 pb-12 sm:p-7 sm:pb-16 shadow-[0_30px_60px_-30px_color-mix(in_srgb,var(--color-brand-navy)_35%,transparent)]">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs sm:text-[13px] font-medium text-brand-slate">{t.heading}</p>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 sm:px-3 sm:py-1 text-[10px] sm:text-[11px] font-bold tracking-wide transition-colors",
              completedJuan ? "bg-brand-mint text-brand-navy" : "bg-brand-mist text-brand-navy"
            )}
          >
            <span
              aria-hidden="true"
              className={cn("size-1.5 rounded-full", completedJuan ? "bg-brand-navy" : "bg-brand-violet oc-pulse")}
            />
            {completedJuan ? t.simSuccessBadge : t.status}
          </span>
        </div>

        {/* Header responsive layout */}
        <div className="mt-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between border-b border-brand-line/60 pb-4">
          <div>
            <p className="text-[1.25rem] font-semibold tracking-[-0.02em] sm:text-2xl text-brand-navy">{t.circle}</p>
            <p className="text-[11px] font-mono text-brand-slate break-all">$ilp.rafiki.money/viaje-2026</p>
          </div>
          <button
            type="button"
            onClick={handleSimulatePayment}
            disabled={isSimulating}
            className="inline-flex w-full sm:w-auto items-center justify-center gap-1.5 rounded-full bg-brand-navy px-3.5 py-2 text-xs font-semibold text-brand-white shadow-2xs transition-transform active:scale-95 hover:bg-brand-navy/90 cursor-pointer disabled:opacity-50"
          >
            {completedJuan ? (
              <>
                <RefreshCw className="size-3" />
                {t.simReset}
              </>
            ) : isSimulating ? (
              <>
                <RefreshCw className="size-3 animate-spin" />
                {t.simActive}
              </>
            ) : (
              <>
                <Zap className="size-3 text-brand-mint" />
                {t.simAction}
              </>
            )}
          </button>
        </div>

        <dl className="mt-4 sm:mt-5 grid grid-cols-2 gap-2 sm:gap-2.5 sm:grid-cols-3">
          <div className="rounded-2xl bg-brand-mist p-3 sm:p-3.5">
            <dt className="text-[10px] sm:text-[11px] font-medium text-brand-navy/70">{t.contribution}</dt>
            <dd className="mt-1 text-sm sm:text-[15px] font-semibold tabular-nums text-brand-navy">{pesosLabel(CONTRIBUTION, locale)}</dd>
          </div>
          <div className="rounded-2xl bg-brand-mist p-3 sm:p-3.5">
            <dt className="text-[10px] sm:text-[11px] font-medium text-brand-navy/70">{t.participants}</dt>
            <dd className="mt-1 text-sm sm:text-[15px] font-semibold text-brand-navy">{fill(t.people, { count: PEOPLE.length })}</dd>
          </div>
          <div className="col-span-2 rounded-2xl bg-brand-navy p-3 sm:p-3.5 text-brand-white sm:col-span-1">
            <dt className="text-[10px] sm:text-[11px] font-medium text-brand-on-navy">{t.pool}</dt>
            <dd className="mt-1 text-sm sm:text-[15px] font-semibold text-brand-mint tabular-nums">{pesosLabel(total, locale)}</dd>
          </div>
        </dl>

        <div className="mt-4 sm:mt-5">
          <div className="flex items-baseline justify-between text-xs sm:text-[13px]">
            <p className="font-medium text-brand-navy">{fill(t.progress, { confirmed: confirmedCount, total: PEOPLE.length })}</p>
            <p className="font-semibold tabular-nums text-brand-violet-ink">{pct}%</p>
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={PEOPLE.length}
            aria-valuenow={confirmedCount}
            aria-label={fill(t.progress, { confirmed: confirmedCount, total: PEOPLE.length })}
            className="mt-2 h-2.5 overflow-hidden rounded-full bg-brand-mist"
          >
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-brand-violet),var(--color-brand-mint))] transition-all duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>

          {/* Avatars and turn receiver responsive row */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5">
            <ul className="flex items-center -space-x-1 sm:space-x-1" aria-hidden="true">
              {order.map((p, i) => {
                const isJuan = i === 4
                const paid = isJuan ? completedJuan : true
                return (
                  <li key={p.name} className="relative">
                    <Avatar
                      name={p.name}
                      tone={p.tone}
                      size="md"
                      className={cn(!paid && "border-2 border-dashed border-brand-slate bg-brand-white ring-0")}
                    />
                    {paid && (
                      <span className="absolute -right-0.5 -bottom-0.5 grid size-3.5 place-items-center rounded-full bg-brand-mint ring-2 ring-brand-white">
                        <Check className="size-2 text-brand-navy" strokeWidth={3.5} />
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
            <div className="text-right text-[11px] leading-tight text-brand-slate shrink-0">
              {t.receives}
              <span className="block text-xs sm:text-[13px] font-semibold text-brand-navy">Andrés</span>
            </div>
          </div>
        </div>

        <div className="mt-4 sm:mt-5 border-t border-brand-line pt-3 sm:pt-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs sm:text-[13px] font-medium text-brand-slate">{t.activity}</p>
            <span className="flex items-center gap-1 text-[10px] sm:text-[11px] text-brand-slate font-mono">
              <ShieldCheck className="size-3 text-brand-violet" />
              {t.hashVerified}
            </span>
          </div>
          <ul className="mt-2 divide-y divide-brand-line">
            {activity.map((p, i) => (
              <li key={p.name} className={cn("flex items-center gap-2.5 sm:gap-3 py-2 sm:py-2.5", i > 2 && "hidden")}>
                <Avatar name={p.name} tone={p.tone} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-[13px] font-semibold text-brand-navy truncate">{p.name}</p>
                  <p className="flex items-center gap-1 text-[10px] sm:text-[11px] text-brand-slate">
                    <CircleCheck className="size-3 text-brand-violet-ink" aria-hidden="true" />
                    {t.confirmed} · {t.times[i]}
                  </p>
                </div>
                <p className="text-xs sm:text-[13px] font-semibold tabular-nums text-brand-navy shrink-0">+{pesos(CONTRIBUTION, locale)}</p>
              </li>
            ))}
            <li className="flex items-center gap-2.5 sm:gap-3 py-2 sm:py-2.5">
              <Avatar
                name="Juan"
                tone="line"
                size="sm"
                className={cn(!completedJuan && "border border-dashed border-brand-slate ring-0")}
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-[13px] font-semibold text-brand-navy truncate">Juan</p>
                <p className="flex items-center gap-1 text-[10px] sm:text-[11px] text-brand-slate">
                  {completedJuan ? (
                    <>
                      <CircleCheck className="size-3 text-brand-violet-ink" aria-hidden="true" />
                      {t.confirmed} · {t.justNow}
                    </>
                  ) : (
                    <>
                      <Clock className="size-3" aria-hidden="true" />
                      {t.pending}
                    </>
                  )}
                </p>
              </div>
              <p
                className={cn(
                  "text-xs sm:text-[13px] font-medium tabular-nums shrink-0",
                  completedJuan ? "font-semibold text-brand-navy" : "text-brand-slate"
                )}
              >
                {completedJuan ? `+${pesos(CONTRIBUTION, locale)}` : pesos(CONTRIBUTION, locale)}
              </p>
            </li>
          </ul>
        </div>
        <figcaption className="mt-3 text-right text-[10px] sm:text-[11px] text-brand-slate">{t.sample}</figcaption>
      </div>

      {/* Floating interactive satellites: shown gracefully on tablet/desktop to avoid mobile overflow */}
      <div className="hidden sm:flex oc-pop absolute -bottom-5 left-3 sm:-bottom-6 sm:-left-8">
        <div className="oc-bob flex items-center gap-2.5 rounded-full border border-brand-line bg-brand-white/95 py-2 pr-4 pl-2.5 shadow-[0_16px_40px_-20px_color-mix(in_srgb,var(--color-brand-navy)_40%,transparent)] backdrop-blur">
          <span className="grid size-6 place-items-center rounded-full bg-brand-mint">
            <Check className="size-3.5 text-brand-navy" strokeWidth={3} aria-hidden="true" />
          </span>
          <p className="text-xs font-semibold text-brand-navy">
            {completedJuan ? t.notifySettled : t.notifyPaid}
          </p>
        </div>
      </div>
      <div className="hidden sm:flex oc-pop absolute right-3 -bottom-10 sm:-right-6 sm:-bottom-12 [animation-delay:1400ms]">
        <div className="oc-bob flex items-center gap-2.5 rounded-full bg-brand-navy py-2 pr-4 pl-2.5 text-brand-white shadow-[0_16px_40px_-18px_color-mix(in_srgb,var(--color-brand-navy)_60%,transparent)] [animation-delay:-3s]">
          <Avatar name="Carlos" tone="mint" size="sm" />
          <p className="text-xs font-semibold">{t.notifyNext}</p>
        </div>
      </div>
    </figure>
  )
}
