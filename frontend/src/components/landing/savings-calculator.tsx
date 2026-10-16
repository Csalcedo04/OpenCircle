"use client"

import { useId, useState } from "react"
import { Info, Minus, Plus } from "lucide-react"
import { fill, type Locale } from "@/i18n/config"
import type { LandingDictionary } from "@/i18n/dictionaries/landing.es"
import { CALC_LIMITS, clampParticipants, estimateCircle, parseContribution } from "@/lib/domain/calculator"
import { cn } from "@/lib/utils"
import { pesos } from "./shared"

const PRESETS = [10_000n, 20_000n, 50_000n, 100_000n] as const
const FEE_STEPS_BPS = 50
const FEE_MAX_BPS = 500

function formatBps(bps: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "es" ? "es-CO" : "en-US", { maximumFractionDigits: 1 }).format(bps / 100) + "%"
}

function grouped(value: bigint, locale: Locale): string {
  return new Intl.NumberFormat(locale === "es" ? "es-CO" : "en-US").format(value)
}

export function SavingsCalculator({ t, locale }: { t: LandingDictionary["calc"]; locale: Locale }) {
  const ids = { people: useId(), amount: useId(), fee: useId(), err: useId(), feeHelp: useId() }
  const [participants, setParticipants] = useState(5)
  const [amountText, setAmountText] = useState(() => grouped(20_000n, locale))
  const [lastValid, setLastValid] = useState(20_000n)
  const [feeBps, setFeeBps] = useState(200)

  const parsed = parseContribution(amountText)
  const contribution = parsed ?? lastValid
  const invalid = parsed === null
  const { total, fee, payout } = estimateCircle(participants, contribution, feeBps)
  const payoutShare = total === 0n ? 100 : Number((payout * 1000n) / total) / 10

  const setAmount = (text: string) => {
    setAmountText(text)
    const v = parseContribution(text)
    if (v !== null) setLastValid(v)
  }

  return (
    <section id="calculadora" aria-labelledby="calculadora-title" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <h2 id="calculadora-title" className="text-[2rem] leading-[1.08] font-semibold tracking-[-0.03em] text-balance sm:text-5xl">
            {t.title}
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-brand-slate">{t.lead}</p>
        </div>

        <div className="mt-12 grid grid-cols-1 overflow-hidden rounded-[28px] border border-brand-line bg-brand-white lg:grid-cols-[1.05fr_1fr]">
          {/* Controls */}
          <div className="space-y-9 p-6 sm:p-9">
            <div>
              <div className="flex items-center justify-between gap-4">
                <label htmlFor={ids.people} className="text-sm font-semibold">
                  {t.participants}
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={t.fewer}
                    disabled={participants <= CALC_LIMITS.minParticipants}
                    onClick={() => setParticipants((n) => clampParticipants(n - 1))}
                    className="grid size-10 place-items-center rounded-full border border-brand-line outline-none transition-colors hover:bg-brand-mist focus-visible:ring-4 focus-visible:ring-brand-violet/30 disabled:opacity-40"
                  >
                    <Minus className="size-4" aria-hidden="true" />
                  </button>
                  <output htmlFor={ids.people} className="w-10 text-center text-2xl font-semibold tabular-nums">
                    {participants}
                  </output>
                  <button
                    type="button"
                    aria-label={t.more}
                    disabled={participants >= CALC_LIMITS.maxParticipants}
                    onClick={() => setParticipants((n) => clampParticipants(n + 1))}
                    className="grid size-10 place-items-center rounded-full border border-brand-line outline-none transition-colors hover:bg-brand-mist focus-visible:ring-4 focus-visible:ring-brand-violet/30 disabled:opacity-40"
                  >
                    <Plus className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <input
                id={ids.people}
                type="range"
                min={CALC_LIMITS.minParticipants}
                max={CALC_LIMITS.maxParticipants}
                step={1}
                value={participants}
                onChange={(e) => setParticipants(clampParticipants(Number(e.target.value)))}
                className="mt-4 h-2 w-full cursor-pointer accent-brand-violet"
              />
              <div className="mt-1.5 flex justify-between text-xs text-brand-slate tabular-nums">
                <span>{CALC_LIMITS.minParticipants}</span>
                <span>{CALC_LIMITS.maxParticipants}</span>
              </div>
            </div>

            <div>
              <label htmlFor={ids.amount} className="text-sm font-semibold">
                {t.contribution}
              </label>
              <div
                className={cn(
                  "mt-3 flex h-14 items-center gap-2 rounded-2xl border bg-brand-canvas px-4 focus-within:ring-4 focus-within:ring-brand-violet/30",
                  invalid ? "border-brand-violet" : "border-brand-line",
                )}
              >
                <span className="text-lg font-semibold text-brand-slate">$</span>
                <input
                  id={ids.amount}
                  inputMode="numeric"
                  autoComplete="off"
                  value={amountText}
                  onChange={(e) => setAmount(e.target.value)}
                  onBlur={() => parsed !== null && setAmountText(grouped(parsed, locale))}
                  aria-invalid={invalid || undefined}
                  aria-describedby={invalid ? ids.err : undefined}
                  className="h-full min-w-0 flex-1 bg-transparent text-xl font-semibold tabular-nums outline-none"
                />
                <span className="text-sm font-medium text-brand-slate">COP</span>
              </div>
              {invalid && (
                <p id={ids.err} className="mt-2 text-sm font-medium text-brand-violet-ink">
                  {t.errorAmount}
                </p>
              )}
              <div role="group" aria-label={t.presets} className="mt-3 flex flex-wrap gap-2">
                {PRESETS.map((v) => {
                  const active = !invalid && contribution === v
                  return (
                    <button
                      key={v.toString()}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setAmount(grouped(v, locale))}
                      className={cn(
                        "h-9 rounded-full px-3.5 text-sm font-semibold tabular-nums outline-none transition-colors focus-visible:ring-4 focus-visible:ring-brand-violet/30",
                        active ? "bg-brand-navy text-brand-white" : "border border-brand-line hover:bg-brand-mist",
                      )}
                    >
                      {pesos(v, locale)}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-3">
                <label htmlFor={ids.fee} className="flex items-center gap-2 text-sm font-semibold">
                  {t.fee}
                  <span className="rounded-full bg-brand-mint px-2 py-0.5 text-[11px] font-semibold">{t.feeBadge}</span>
                </label>
                <span className="text-lg font-semibold tabular-nums">{formatBps(feeBps, locale)}</span>
              </div>
              <input
                id={ids.fee}
                type="range"
                min={0}
                max={FEE_MAX_BPS}
                step={FEE_STEPS_BPS}
                value={feeBps}
                onChange={(e) => setFeeBps(Number(e.target.value))}
                aria-describedby={ids.feeHelp}
                aria-valuetext={formatBps(feeBps, locale)}
                className="mt-4 h-2 w-full cursor-pointer accent-brand-violet"
              />
              <p id={ids.feeHelp} className="mt-2 text-sm text-brand-slate">
                {t.feeHelp}
              </p>
            </div>
          </div>

          {/* Result */}
          <div className="relative isolate overflow-hidden bg-brand-navy p-6 text-brand-white sm:p-9">
            <div
              aria-hidden="true"
              className="absolute -top-24 -right-24 -z-10 size-80 rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--color-brand-violet)_45%,transparent),transparent)]"
            />
            <div aria-live="polite" className={cn("transition-opacity", invalid && "opacity-50")}>
              <p className="text-sm font-medium text-brand-on-navy">{t.payoutLabel}</p>
              <p className="mt-2 text-[2.75rem] leading-none font-semibold tracking-[-0.04em] text-brand-mint tabular-nums sm:text-6xl">
                {pesos(payout, locale)}
              </p>

              <div className="mt-8">
                <p className="sr-only">{t.breakdown}</p>
                <div aria-hidden="true" className="flex h-3 overflow-hidden rounded-full bg-brand-white/10">
                  <div className="h-full rounded-l-full bg-brand-mint transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${payoutShare}%` }} />
                  <div className="h-full flex-1 bg-brand-violet" />
                </div>
                <dl className="mt-6 space-y-3 text-[15px]">
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-brand-on-navy">{t.total}</dt>
                    <dd className="font-semibold tabular-nums">{pesos(total, locale)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="flex items-center gap-2 text-brand-on-navy">
                      <span aria-hidden="true" className="size-2.5 rounded-full bg-brand-violet" />
                      {fill(t.feeLine, { rate: formatBps(feeBps, locale) })}
                    </dt>
                    <dd className="font-semibold tabular-nums">− {pesos(fee, locale)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4 border-t border-brand-white/15 pt-3">
                    <dt className="flex items-center gap-2 font-semibold">
                      <span aria-hidden="true" className="size-2.5 rounded-full bg-brand-mint" />
                      {t.payoutLine}
                    </dt>
                    <dd className="font-semibold text-brand-mint tabular-nums">{pesos(payout, locale)}</dd>
                  </div>
                </dl>
              </div>

              <p className="mt-6 text-sm leading-relaxed text-brand-on-navy">
                {fill(t.summary, {
                  each: pesos(contribution, locale),
                  n: participants,
                  total: pesos(total, locale),
                  payout: pesos(payout, locale),
                })}
              </p>
            </div>
            <p className="mt-6 flex gap-2 rounded-2xl bg-brand-white/[0.06] p-4 text-[13px] leading-relaxed text-brand-on-navy">
              <Info className="mt-0.5 size-4 shrink-0 text-brand-mint" aria-hidden="true" />
              {t.note}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
