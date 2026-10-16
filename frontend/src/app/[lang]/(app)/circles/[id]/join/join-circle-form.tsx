"use client"

import { useState, type FormEvent } from "react"
import { CheckCircle2, CircleCheck, Lock, ShieldCheck, Wallet } from "lucide-react"
import { FormField, describedBy } from "@/components/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { fill, type Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import { amount, formatAmount, parseWholeUnits } from "@/lib/domain/money"
import { evaluateCoverage } from "@/lib/domain/rounds"
import type { Circle, GrantMode } from "@/lib/domain/types"
import { cn } from "@/lib/utils"

type Props = {
  locale: Locale
  circle: Circle
  t: Dictionary["join"]
  tc: Pick<Dictionary["circle"], "owes" | "collateral" | "grant" | "uncovered" | "threshold" | "eligible" | "seat">
  notCovered: string
}
type Field = "wallet" | "seat" | "collateral"

export function JoinCircleForm({ locale, circle, t, tc, notCovered }: Props) {
  const taken = new Set(circle.seats.map((s) => s.payoutRound))
  const free = Array.from({ length: circle.size }, (_, i) => i + 1).filter((n) => !taken.has(n))
  const [wallet, setWallet] = useState("")
  const [seat, setSeat] = useState<number | null>(free[0] ?? null)
  const [grant, setGrant] = useState<GrantMode>("RECURRING")
  const [collateral, setCollateral] = useState("")
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const [submitted, setSubmitted] = useState(false)

  const collateralValue = collateral.trim() === "" ? 0n : (parseWholeUnits(collateral, circle.contribution.assetScale) ?? 0n)
  const coverage = seat ? evaluateCoverage(circle, { payoutRound: seat, collateralValue: collateralValue.toString(), grant }) : null
  const money = (v: bigint) => formatAmount(amount(v, circle.contribution), locale)
  const weight = `${Math.floor(circle.grantWeightBps / 100)}%`

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next: Partial<Record<Field, string>> = {}

    const isValidWallet = /^\$[\w.-]+(\/[\w./-]*)?$/.test(wallet.trim()) || wallet.trim().startsWith("https://")
    if (!isValidWallet) next.wallet = t.errors.wallet
    if (!seat || !free.includes(seat)) next.seat = t.errors.seat
    if (collateral.trim() !== "" && parseWholeUnits(collateral, circle.contribution.assetScale) === null) {
      next.collateral = t.errors.collateral
    }

    if (Object.keys(next).length > 0) {
      setErrors(next)
      setSubmitted(false)
      return
    }

    setErrors({})
    setSubmitted(true)
  }

  if (free.length === 0) {
    return (
      <div className="rounded-[32px] border border-brand-line bg-brand-white p-8 text-center text-sm text-brand-slate">
        {t.full}
      </div>
    )
  }

  return (
    <div className="grid gap-8 lg:grid-cols-12 items-start">
      {/* Configuration Form Bento Card */}
      <div className="rounded-[32px] border border-brand-line bg-brand-white p-6 shadow-2xs sm:p-8 lg:col-span-7">
        <form onSubmit={onSubmit} noValidate className="space-y-6">
          <FormField id="wallet" label={t.wallet} help={t.walletHelp} error={errors.wallet}>
            <div className="relative">
              <Wallet className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-brand-slate" />
              <Input
                id="wallet"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={wallet}
                onChange={(e) => setWallet(e.target.value)}
                placeholder={t.walletPlaceholder}
                aria-invalid={errors.wallet ? true : undefined}
                aria-describedby={describedBy("wallet", errors.wallet)}
                className="h-11 rounded-xl pl-10 text-base font-mono"
              />
            </div>
          </FormField>

          {/* Seat Picker Grid with Bento Buttons */}
          <div>
            <label className="text-sm font-semibold text-brand-navy block mb-2">{t.seat}</label>
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
              {Array.from({ length: circle.size }, (_, i) => i + 1).map((n) => {
                const isTaken = taken.has(n)
                const isSelected = seat === n
                return (
                  <button
                    key={n}
                    type="button"
                    disabled={isTaken}
                    onClick={() => setSeat(n)}
                    className={cn(
                      "flex flex-col items-center justify-center rounded-2xl border p-3 text-xs font-semibold transition-all active:scale-95",
                      isTaken && "cursor-not-allowed border-dashed border-brand-slate/40 bg-brand-canvas/60 text-brand-slate opacity-60",
                      !isTaken && isSelected && "border-brand-navy bg-brand-navy text-brand-white shadow-2xs ring-2 ring-brand-navy/20",
                      !isTaken && !isSelected && "border-brand-line bg-brand-canvas text-brand-navy hover:border-brand-navy/30",
                    )}
                  >
                    <span className="text-sm font-bold">{fill(tc.seat, { round: n })}</span>
                    <span className={cn("mt-0.5 text-[10px]", isSelected ? "text-brand-mint font-normal" : "text-brand-slate")}>
                      {isTaken ? t.seatTaken : locale === "es" ? "Disponible" : "Available"}
                    </span>
                  </button>
                )
              })}
            </div>
            {errors.seat && <p className="mt-1.5 text-xs font-semibold text-destructive">{errors.seat}</p>}
          </div>

          {/* Grant Mode Options */}
          <div>
            <label className="text-sm font-semibold text-brand-navy block mb-2">{t.approval}</label>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["RECURRING", t.recurring, t.recurringHelp],
                  ["PER_ROUND", t.perRound, t.perRoundHelp],
                ] as const
              ).map(([mode, title, help]) => (
                <div
                  key={mode}
                  onClick={() => setGrant(mode)}
                  className={cn(
                    "cursor-pointer rounded-2xl border p-4 transition-all active:scale-[0.99]",
                    grant === mode
                      ? "border-brand-violet bg-brand-violet/5 shadow-2xs"
                      : "border-brand-line bg-brand-canvas hover:border-brand-navy/30",
                  )}
                >
                  <div className="flex items-center gap-2 font-semibold text-xs text-brand-navy">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-4 rounded-full border-2 border-brand-violet transition-colors",
                        grant === mode && "border-[5px]",
                      )}
                    />
                    <span>{title}</span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-brand-slate">{help}</p>
                </div>
              ))}
            </div>
          </div>

          <FormField id="collateral" label={t.collateral} help={t.collateralHelp} error={errors.collateral}>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-sm text-brand-slate">
                $
              </span>
              <Input
                id="collateral"
                inputMode="numeric"
                value={collateral}
                onChange={(e) => setCollateral(e.target.value)}
                placeholder="0"
                aria-invalid={errors.collateral ? true : undefined}
                aria-describedby={describedBy("collateral", errors.collateral)}
                className="h-11 rounded-xl pl-8 text-base tabular-nums font-mono"
              />
            </div>
          </FormField>

          <Button
            type="submit"
            className="h-12 w-full rounded-full bg-brand-violet px-6 text-sm font-semibold text-brand-white shadow-[0_6px_20px_-8px_var(--color-brand-violet)] transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-brand-violet-ink focus-visible:ring-4 focus-visible:ring-brand-violet/30 active:translate-y-0 sm:w-auto"
          >
            <Wallet className="size-4 shrink-0" aria-hidden="true" />
            <span>{t.submit}</span>
          </Button>

          {submitted && (
            <div
              role="status"
              className="flex items-start gap-3 rounded-2xl bg-brand-mint/40 border border-brand-mint p-4 text-xs font-semibold text-brand-navy animate-in fade-in zoom-in-95"
            >
              <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{t.submitted}</span>
            </div>
          )}
        </form>
      </div>

      {/* Real-time Safe Round Simulator Bento Card */}
      {coverage && (
        <aside className="rounded-[32px] border border-brand-line bg-brand-white p-6 shadow-2xs sm:p-8 lg:col-span-5" aria-live="polite">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-full bg-brand-violet/10 text-brand-violet-ink">
              <ShieldCheck className="size-4.5" />
            </span>
            <h2 className="text-lg font-bold tracking-tight text-brand-navy">{t.coverageTitle}</h2>
          </div>
          <p className="mt-1 text-xs text-brand-slate">{t.coverageLead}</p>

          <dl className="mt-6 space-y-2 rounded-2xl bg-brand-canvas p-4 border border-brand-line/60 text-xs">
            {[
              [tc.owes, money(coverage.owes)],
              [tc.collateral, `− ${money(coverage.collateral)}`],
              [fill(tc.grant, { weight }), `− ${money(coverage.grantCoverage)}`],
              [tc.uncovered, money(coverage.uncovered)],
              [tc.threshold, money(coverage.threshold)],
            ].map(([label, value], i) => (
              <div
                key={label}
                className={cn(
                  "flex items-baseline justify-between gap-4",
                  i === 3 && "border-t border-brand-line pt-2 font-bold text-brand-navy",
                )}
              >
                <dt className="text-brand-slate">{label}</dt>
                <dd className="font-mono tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>

          <div
            className={cn(
              "mt-6 flex items-start gap-2.5 rounded-2xl p-4 text-xs font-semibold leading-relaxed",
              coverage.eligible
                ? "bg-brand-mint text-brand-navy border border-brand-mint"
                : "bg-brand-navy text-brand-white border border-brand-navy",
            )}
          >
            {coverage.eligible ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-navy" aria-hidden="true" />
            ) : (
              <Lock className="mt-0.5 size-4 shrink-0 text-brand-mint" aria-hidden="true" />
            )}
            <p>{coverage.eligible ? tc.eligible : notCovered}</p>
          </div>
        </aside>
      )}
    </div>
  )
}
