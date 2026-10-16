"use client"

import { useState, type FormEvent } from "react"
import { CircleCheck, Lock, Wallet } from "lucide-react"
import { z } from "zod"
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

  const schema = z.object({
    wallet: z
      .string()
      .trim()
      .refine((v) => /^\$[\w.-]+(\/[\w./-]*)?$/.test(v) || z.url({ protocol: /^https$/ }).safeParse(v).success, t.errors.wallet),
    seat: z.number().int().refine((n) => free.includes(n), t.errors.seat),
    collateral: z.string().refine((v) => v.trim() === "" || parseWholeUnits(v, circle.contribution.assetScale) !== null, t.errors.collateral),
  })

  const collateralValue = collateral.trim() === "" ? 0n : (parseWholeUnits(collateral, circle.contribution.assetScale) ?? 0n)
  const coverage = seat ? evaluateCoverage(circle, { payoutRound: seat, collateralValue: collateralValue.toString(), grant }) : null
  const money = (v: bigint) => formatAmount(amount(v, circle.contribution), locale)
  const weight = `${Math.floor(circle.grantWeightBps / 100)}%`

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = schema.safeParse({ wallet, seat: seat ?? 0, collateral })
    if (!result.success) {
      const next: Partial<Record<Field, string>> = {}
      for (const issue of result.error.issues) {
        const key = issue.path[0]
        if (typeof key === "string" && !(key in next)) next[key as Field] = issue.message
      }
      setErrors(next)
      setSubmitted(false)
      return
    }
    setErrors({})
    setSubmitted(true)
  }

  if (free.length === 0) return <p className="text-muted-foreground">{t.full}</p>

  return (
    <div className="grid gap-10 lg:grid-cols-[1.2fr_1fr]">
      <form onSubmit={onSubmit} noValidate className="space-y-7">
        <FormField id="wallet" label={t.wallet} help={t.walletHelp} error={errors.wallet}>
          <Input
            id="wallet"
            type="url"
            autoComplete="off"
            spellCheck={false}
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
            placeholder={t.walletPlaceholder}
            aria-invalid={errors.wallet ? true : undefined}
            aria-describedby={describedBy("wallet", errors.wallet)}
            className="h-11 text-base"
          />
        </FormField>

        <fieldset>
          <legend className="text-sm font-medium">{t.seat}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {Array.from({ length: circle.size }, (_, i) => i + 1).map((n) => {
              const isTaken = taken.has(n)
              return (
                <label
                  key={n}
                  className={cn(
                    "flex min-w-24 cursor-pointer flex-col rounded-xl border-2 px-3 py-2 text-sm has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                    isTaken && "cursor-not-allowed border-dashed border-brand-slate text-muted-foreground",
                    !isTaken && seat === n && "border-brand-navy bg-brand-navy text-brand-white",
                    !isTaken && seat !== n && "border-brand-line",
                  )}
                >
                  <input
                    type="radio"
                    name="seat"
                    value={n}
                    checked={seat === n}
                    disabled={isTaken}
                    onChange={() => setSeat(n)}
                    className="sr-only"
                  />
                  <span className="font-medium">{fill(tc.seat, { round: n })}</span>
                  {isTaken && <span className="text-xs">{t.seatTaken}</span>}
                </label>
              )
            })}
          </div>
          {errors.seat && <p className="mt-1.5 text-sm font-medium text-brand-violet-ink">{errors.seat}</p>}
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium">{t.approval}</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {(
              [
                ["RECURRING", t.recurring, t.recurringHelp],
                ["PER_ROUND", t.perRound, t.perRoundHelp],
              ] as const
            ).map(([mode, title, help]) => (
              <label
                key={mode}
                className={cn(
                  "cursor-pointer rounded-xl border-2 p-3 has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                  grant === mode ? "border-brand-navy" : "border-brand-line",
                )}
              >
                <input type="radio" name="grant" value={mode} checked={grant === mode} onChange={() => setGrant(mode)} className="sr-only" />
                <span className="flex items-center gap-2 font-medium">
                  <span
                    aria-hidden="true"
                    className={cn("size-4 rounded-full border-2 border-brand-navy", grant === mode && "border-[5px]")}
                  />
                  {title}
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">{help}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <FormField id="collateral" label={t.collateral} help={t.collateralHelp} error={errors.collateral}>
          <Input
            id="collateral"
            inputMode="numeric"
            value={collateral}
            onChange={(e) => setCollateral(e.target.value)}
            placeholder="0"
            aria-invalid={errors.collateral ? true : undefined}
            aria-describedby={describedBy("collateral", errors.collateral)}
            className="h-11 text-base tabular-nums"
          />
        </FormField>

        <Button type="submit" size="lg" className="h-11 gap-2 px-5 text-base">
          <Wallet className="size-4" aria-hidden="true" />
          {t.submit}
        </Button>
        {submitted && (
          <p role="status" className="flex items-start gap-2 rounded-lg bg-brand-violet px-4 py-3 text-sm text-brand-white">
            <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {t.submitted}
          </p>
        )}
      </form>

      {coverage && (
        <aside className="h-fit rounded-2xl border-2 border-brand-line p-6" aria-live="polite">
          <h2 className="font-heading text-xl font-semibold">{t.coverageTitle}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t.coverageLead}</p>
          <dl className="mt-4 space-y-1.5 text-sm">
            {[
              [tc.owes, money(coverage.owes)],
              [tc.collateral, `− ${money(coverage.collateral)}`],
              [fill(tc.grant, { weight }), `− ${money(coverage.grantCoverage)}`],
              [tc.uncovered, money(coverage.uncovered)],
              [tc.threshold, money(coverage.threshold)],
            ].map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <p
            className={cn(
              "mt-4 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-brand-white",
              coverage.eligible ? "bg-brand-violet" : "bg-brand-navy",
            )}
          >
            {coverage.eligible ? <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
            {coverage.eligible ? tc.eligible : notCovered}
          </p>
        </aside>
      )}
    </div>
  )
}
