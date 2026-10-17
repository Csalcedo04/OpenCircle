"use client"

import { useActionState, useState } from "react"
import { CheckCircle2, ListOrdered, LoaderCircle, Lock, ShieldCheck, Wallet } from "lucide-react"
import { FormField, describedBy } from "@/components/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { fill, type Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import { amount, formatAmount, parseWholeUnits } from "@/lib/domain/money"
import { evaluateCoverage } from "@/lib/domain/rounds"
import type { Circle, GrantMode } from "@/lib/domain/types"
import { cn } from "@/lib/utils"
import { applyCircleAction, joinCircleAction, type JoinState } from "./actions"

type Props = {
  locale: Locale
  circle: Circle
  /** `join` takes the seat; `apply` asks the circle's members for one (public circles without a link). */
  mode: "join" | "apply"
  /** From a private circle's link; sent with the join. */
  invite?: string | undefined
  t: Dictionary["join"]
  tErr: Dictionary["circleErrors"]
  tc: Pick<Dictionary["circle"], "owes" | "collateral" | "grant" | "uncovered" | "threshold" | "eligible">
  notCovered: string
}
export function JoinCircleForm({ locale, circle, mode, invite, t, tErr, tc, notCovered }: Props) {
  const [grant, setGrant] = useState<GrantMode>("RECURRING")
  const [collateral, setCollateral] = useState("")
  const seat = { id: circle.id, assetScale: circle.contribution.assetScale }
  const [state, action, pending] = useActionState<JoinState, FormData>(
    mode === "apply" ? applyCircleAction.bind(null, locale, seat) : joinCircleAction.bind(null, locale, { ...seat, ...(invite ? { invite } : {}) }),
    { errors: {}, form: null },
  )
  const errors = {
    collateral: state.errors.collateral ? tErr[state.errors.collateral] : undefined,
  }

  const collateralValue = collateral.trim() === "" ? 0n : (parseWholeUnits(collateral, circle.contribution.assetScale) ?? 0n)
  // The round is only known once the circle fills, so show the worst case: paid in round 1, owing the rest.
  const coverage = evaluateCoverage(circle, { payoutRound: 1, collateralValue: collateralValue.toString(), grant })
  const money = (v: bigint) => formatAmount(amount(v, circle.contribution), locale)
  const weight = `${Math.floor(circle.grantWeightBps / 100)}%`

  if (circle.seats.length >= circle.size) {
    return (
      <div className="rounded-[32px] border border-brand-line bg-brand-white p-8 text-center text-sm text-brand-slate">
        {t.full}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-start">
      {/* Configuration Form Bento Card */}
      <div className="rounded-[32px] border border-brand-line bg-brand-white p-6 shadow-2xs sm:p-8 lg:col-span-7">
        <form action={action} noValidate className="space-y-6">
          {/* The approval picker is buttons; the choice travels in a hidden field. */}
          <input type="hidden" name="grantMode" value={grant} />
          <div className="flex items-start gap-3 rounded-2xl border border-brand-line bg-brand-canvas p-4">
            <ListOrdered className="mt-0.5 size-4 shrink-0 text-brand-violet" aria-hidden="true" />
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-brand-navy">{t.order}</p>
              <p className="text-brand-navy">{circle.payoutOrder === "BEST_SCORE_LAST" ? t.orderBestLast : t.orderBestFirst}</p>
              <p className="text-brand-slate">{t.orderHelp}</p>
            </div>
          </div>

          {/* Grant Mode Options */}
          <div>
            <label className="text-sm font-semibold text-brand-navy block mb-2">{t.approval}</label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                name="collateral"
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

          {state.form && (
            <p role="alert" className="oc-fade-in rounded-xl bg-brand-mist p-3 text-sm font-medium text-brand-violet-ink">
              {tErr[state.form]}
            </p>
          )}

          <Button
            type="submit"
            disabled={pending}
            className="h-12 w-full rounded-full bg-brand-violet px-6 text-sm font-semibold text-brand-white shadow-[0_6px_20px_-8px_var(--color-brand-violet)] transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-brand-violet-ink focus-visible:ring-4 focus-visible:ring-brand-violet/30 active:translate-y-0 sm:w-auto"
          >
            {pending ? (
              <LoaderCircle className="size-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" />
            ) : (
              <Wallet className="size-4 shrink-0" aria-hidden="true" />
            )}
            <span>{mode === "apply" ? (pending ? t.applying : t.applySubmit) : pending ? t.joining : t.submit}</span>
          </Button>

        </form>
      </div>

      {/* Real-time Safe Round Simulator Bento Card */}
      <aside className="rounded-[32px] border border-brand-line bg-brand-white p-6 shadow-2xs sm:p-8 lg:col-span-5" aria-live="polite">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-full bg-brand-violet/10 text-brand-violet-ink">
            <ShieldCheck className="size-4.5" />
          </span>
          <h2 className="text-lg font-bold tracking-tight text-brand-navy">{t.coverageTitle}</h2>
        </div>
        <p className="mt-1 text-xs text-brand-slate">{t.coverageLead}</p>
        <p className="mt-1 text-xs text-brand-slate">{t.worstCase}</p>

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
    </div>
  )
}
