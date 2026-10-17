"use client"

import { useActionState, useState } from "react"
import { CheckCircle2, Coins, LoaderCircle, Sparkles, Users, Zap } from "lucide-react"
import { FormField, describedBy } from "@/components/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { fill, type Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import { amount, applyBps, formatAmount, parseWholeUnits } from "@/lib/domain/money"
import { CADENCES, CIRCLE_ASSET_SCALE } from "@/lib/flows/circles"
import { cn } from "@/lib/utils"
import { createCircleAction, type CreateState } from "./actions"

const COP = { assetCode: "COP", assetScale: CIRCLE_ASSET_SCALE } as const
// Shown in the projection; the API applies the real fee.
const FEE_BPS = 200
const SIZES = ["3", "5", "8", "10", "12"]

type Props = { locale: Locale; t: Dictionary["create"]; tErr: Dictionary["circleErrors"] }

const chip = (active: boolean) =>
  cn(
    "flex h-10 min-w-12 items-center justify-center rounded-xl border px-3 text-sm font-semibold transition-all active:scale-95",
    active ? "border-brand-violet bg-brand-violet text-brand-white shadow-2xs" : "border-brand-line bg-brand-canvas text-brand-navy hover:border-brand-navy/30",
  )

export function CreateCircleForm({ locale, t, tErr }: Props) {
  const [amountInput, setAmountInput] = useState("20000")
  const [size, setSize] = useState("5")
  const [cadence, setCadence] = useState<(typeof CADENCES)[number]>("WEEKLY")
  const [payoutRound, setPayoutRound] = useState(1)
  const [state, action, pending] = useActionState<CreateState, FormData>(createCircleAction.bind(null, locale), { errors: {}, form: null })
  const err = (field: keyof CreateState["errors"]) => {
    const key = state.errors[field]
    return key ? tErr[key] : undefined
  }

  const contribution = parseWholeUnits(amountInput, COP.assetScale)
  const members = /^\d{1,2}$/.test(size) ? BigInt(size) : 0n
  const pot = contribution !== null ? contribution * members : 0n
  const fee = applyBps(pot, FEE_BPS)
  const payout = pot - fee
  const money = (v: bigint) => formatAmount(amount(v, COP), locale)
  const rounds = Array.from({ length: Number(members) }, (_, i) => i + 1)

  return (
    <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
      {/* Form Parameters Bento Card */}
      <div className="rounded-[32px] border border-brand-line bg-brand-white p-6 shadow-2xs sm:p-8 lg:col-span-7">
        <form action={action} noValidate className="space-y-6">
          {/* Chip pickers are buttons; their choice travels in hidden fields. */}
          <input type="hidden" name="size" value={size} />
          <input type="hidden" name="cadence" value={cadence} />
          <input type="hidden" name="payoutRound" value={payoutRound} />

          <FormField id="name" label={t.name} error={err("name")}>
            <Input
              id="name"
              name="name"
              placeholder={t.namePlaceholder}
              aria-invalid={err("name") ? true : undefined}
              aria-describedby={describedBy("name", err("name"))}
              className="h-11 rounded-xl text-base"
            />
          </FormField>

          <FormField id="city" label={t.city} error={err("city")}>
            <Input
              id="city"
              name="city"
              autoComplete="address-level2"
              placeholder={t.cityPlaceholder}
              aria-invalid={err("city") ? true : undefined}
              aria-describedby={describedBy("city", err("city"))}
              className="h-11 rounded-xl text-base"
            />
          </FormField>

          <FormField id="amount" label={t.amount} help={t.amountHelp} error={err("amount")}>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-sm text-brand-slate">$</span>
              <Input
                id="amount"
                name="amount"
                inputMode="numeric"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                aria-invalid={err("amount") ? true : undefined}
                aria-describedby={describedBy("amount", err("amount"))}
                className="h-11 rounded-xl pl-8 text-base tabular-nums font-mono"
              />
            </div>
          </FormField>

          <fieldset>
            <legend className="mb-2 block text-sm font-semibold text-brand-navy">{t.size}</legend>
            <div className="flex flex-wrap gap-2">
              {SIZES.map((s) => (
                <button
                  type="button"
                  key={s}
                  aria-pressed={size === s}
                  onClick={() => {
                    setSize(s)
                    if (payoutRound > Number(s)) setPayoutRound(1)
                  }}
                  className={chip(size === s)}
                >
                  {s}
                </button>
              ))}
            </div>
            {err("size") && <p className="oc-fade-in mt-1.5 text-sm font-medium text-brand-violet-ink">{err("size")}</p>}
          </fieldset>

          <fieldset>
            <legend className="mb-2 block text-sm font-semibold text-brand-navy">{t.cadence}</legend>
            <div className="flex flex-wrap gap-2">
              {CADENCES.map((c) => (
                <button type="button" key={c} aria-pressed={cadence === c} onClick={() => setCadence(c)} className={chip(cadence === c)}>
                  {c === "WEEKLY" ? t.weekly : t.monthly}
                </button>
              ))}
            </div>
            {err("cadence") && <p className="oc-fade-in mt-1.5 text-sm font-medium text-brand-violet-ink">{err("cadence")}</p>}
          </fieldset>

          <fieldset>
            <legend className="mb-1 block text-sm font-semibold text-brand-navy">{t.payoutRound}</legend>
            <p className="mb-2 text-sm text-muted-foreground">{t.payoutRoundHelp}</p>
            <div className="flex flex-wrap gap-2">
              {rounds.map((n) => (
                <button type="button" key={n} aria-pressed={payoutRound === n} onClick={() => setPayoutRound(n)} className={chip(payoutRound === n)}>
                  {n}
                </button>
              ))}
            </div>
            {err("seat") && <p className="oc-fade-in mt-1.5 text-sm font-medium text-brand-violet-ink">{err("seat")}</p>}
          </fieldset>

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
              <Sparkles className="size-4 shrink-0" aria-hidden="true" />
            )}
            <span>{pending ? t.creating : t.submit}</span>
          </Button>
        </form>
      </div>

      {/* Live Financial Projection Card (Bento Aside) */}
      <aside className="rounded-[32px] border border-brand-navy bg-brand-navy p-6 text-brand-white shadow-sm sm:p-8 lg:col-span-5" aria-live="polite">
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-white/10 px-3 py-1 text-xs font-semibold text-brand-mint">
            <Zap className="size-3 text-brand-mint" aria-hidden="true" />
            <span>{t.preview}</span>
          </div>
          <Coins className="size-5 text-brand-mint" aria-hidden="true" />
        </div>

        <div className="mt-6">
          <p className="text-xs font-medium text-brand-on-navy">{t.payoutLine}</p>
          <p className="mt-1 font-mono text-4xl font-extrabold tracking-tight text-brand-mint tabular-nums">{money(payout)}</p>
          <p className="mt-1 text-xs text-brand-on-navy">{t.payoutHelp}</p>
        </div>

        <dl className="mt-8 space-y-3 rounded-2xl border border-brand-white/10 bg-brand-white/5 p-4 text-xs">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="flex items-center gap-1.5 text-brand-on-navy">
              <Users className="size-3 text-brand-mint" aria-hidden="true" />
              <span>{t.potLine}</span>
            </dt>
            <dd className="font-mono text-sm font-semibold tabular-nums text-brand-white">{money(pot)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-brand-on-navy">{t.feeLine}</dt>
            <dd className="font-mono text-sm font-medium tabular-nums text-brand-on-navy">− {money(fee)}</dd>
          </div>
        </dl>

        {contribution !== null && members > 0n && (
          <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-brand-white/10 bg-brand-white/5 p-3 text-xs leading-relaxed text-brand-on-navy">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-mint" aria-hidden="true" />
            <p>{fill(t.totalLine, { size: members.toString(), paid: money(pot), received: money(payout) })}</p>
          </div>
        )}
      </aside>
    </div>
  )
}
