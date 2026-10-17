"use client"

import { useActionState, useState } from "react"
import { CheckCircle2, Coins, Globe, Lock, LoaderCircle, Sparkles, Users, Zap } from "lucide-react"
import { FormField, describedBy } from "@/components/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { fill, type Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import { amount, applyBps, formatAmount, parseWholeUnits } from "@/lib/domain/money"
import { cn } from "@/lib/utils"
import { createCircleAction, type CreateCircleActionState } from "../actions"

const COP = { assetCode: "COP", assetScale: 2 } as const
const FEE_BPS = 200

type Props = { locale: Locale; t: Dictionary["create"] }

const SIZES = ["3", "5", "8", "10", "12"]
const CITIES = ["Medellín", "Bogotá", "Cali", "Barranquilla", "Bucaramanga", "Cartagena", "Pereira", "Manizales", "Otra"]

const selectClass =
  "h-11 w-full rounded-xl border border-brand-line bg-brand-white px-3 text-base text-brand-navy outline-none transition-colors focus-visible:border-brand-violet focus-visible:ring-3 focus-visible:ring-brand-violet/20"

export function CreateCircleForm({ locale, t }: Props) {
  const [name, setName] = useState("")
  const [city, setCity] = useState("Medellín")
  const [amountInput, setAmountInput] = useState("20000")
  const [size, setSize] = useState("5")
  const [cadence, setCadence] = useState<"WEEKLY" | "MONTHLY">("WEEKLY")
  const [visibility, setVisibility] = useState<"PRIVATE" | "PUBLIC">("PUBLIC")
  const [payoutRound, setPayoutRound] = useState("1")

  const actionWithLocale = createCircleAction.bind(null, locale)
  const [state, formAction, isPending] = useActionState<CreateCircleActionState, FormData>(actionWithLocale, { error: null })

  const contribution = parseWholeUnits(amountInput, COP.assetScale)
  const members = /^\d{1,2}$/.test(size) ? BigInt(size) : 0n
  const pot = contribution !== null ? contribution * members : 0n
  const fee = applyBps(pot, FEE_BPS)
  const payout = pot - fee
  const money = (v: bigint) => formatAmount(amount(v, COP), locale)

  const sizeNum = Number(size) || 5
  const rounds = Array.from({ length: sizeNum }, (_, i) => String(i + 1))

  return (
    <div className="grid gap-8 lg:grid-cols-12 items-start">
      {/* Form Parameters Bento Card */}
      <div className="rounded-[32px] border border-brand-line bg-brand-white p-6 shadow-2xs sm:p-8 lg:col-span-7">
        <form action={formAction} noValidate className="space-y-6">
          <input type="hidden" name="size" value={size} />
          <input type="hidden" name="cadence" value={cadence} />
          <input type="hidden" name="visibility" value={visibility} />
          <input type="hidden" name="payoutRound" value={payoutRound} />

          <FormField id="name" label={t.name} error={state.error === "name" ? t.errors.name : undefined}>
            <Input
              id="name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.namePlaceholder}
              aria-invalid={state.error === "name" ? true : undefined}
              aria-describedby={describedBy("name", state.error === "name" ? t.errors.name : undefined)}
              className="h-11 rounded-xl text-base"
              required
            />
          </FormField>

          <FormField id="city" label={t.city}>
            <select
              id="city"
              name="city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className={selectClass}
            >
              {CITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </FormField>

          <FormField id="amount" label={t.amount} help={t.amountHelp} error={state.error === "amount" ? t.errors.amount : undefined}>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-sm text-brand-slate">
                $
              </span>
              <Input
                id="amount"
                name="amount"
                inputMode="numeric"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                aria-invalid={state.error === "amount" ? true : undefined}
                aria-describedby={describedBy("amount", state.error === "amount" ? t.errors.amount : undefined)}
                className="h-11 rounded-xl pl-8 text-base tabular-nums font-mono"
                required
              />
            </div>
          </FormField>

          {/* Quick Size Picker Chips */}
          <div>
            <label className="text-sm font-semibold text-brand-navy block mb-2">{t.size}</label>
            <div className="flex flex-wrap gap-2">
              {SIZES.map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => {
                    setSize(s)
                    if (Number(payoutRound) > Number(s)) {
                      setPayoutRound("1")
                    }
                  }}
                  className={cn(
                    "flex h-10 min-w-12 items-center justify-center rounded-xl border px-3 text-sm font-semibold transition-all active:scale-95",
                    size === s
                      ? "border-brand-violet bg-brand-violet text-brand-white shadow-2xs"
                      : "border-brand-line bg-brand-canvas text-brand-navy hover:border-brand-navy/30",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
            {state.error === "size" && <p className="mt-1 text-xs text-destructive">{t.errors.size}</p>}
          </div>

          {/* Cadence Selector Chips */}
          <div>
            <label className="text-sm font-semibold text-brand-navy block mb-2">{t.cadence}</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setCadence("WEEKLY")}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-2xl border p-3.5 text-left transition-all active:scale-95",
                  cadence === "WEEKLY"
                    ? "border-brand-violet bg-brand-violet/5 ring-1 ring-brand-violet"
                    : "border-brand-line bg-brand-canvas hover:border-brand-navy/30",
                )}
              >
                <span className="text-sm font-semibold text-brand-navy">{t.cadenceWeekly}</span>
                <span className="text-xs text-brand-slate">{locale === "es" ? "7 días por periodo" : "7 days per round"}</span>
              </button>

              <button
                type="button"
                onClick={() => setCadence("MONTHLY")}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-2xl border p-3.5 text-left transition-all active:scale-95",
                  cadence === "MONTHLY"
                    ? "border-brand-violet bg-brand-violet/5 ring-1 ring-brand-violet"
                    : "border-brand-line bg-brand-canvas hover:border-brand-navy/30",
                )}
              >
                <span className="text-sm font-semibold text-brand-navy">{t.cadenceMonthly}</span>
                <span className="text-xs text-brand-slate">{locale === "es" ? "30 días por periodo" : "30 days per round"}</span>
              </button>
            </div>
          </div>

          {/* Visibility Selector Chips */}
          <div>
            <label className="text-sm font-semibold text-brand-navy block mb-2">{t.visibility}</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setVisibility("PRIVATE")}
                className={cn(
                  "flex items-center gap-2 rounded-2xl border p-3.5 text-left transition-all active:scale-95",
                  visibility === "PRIVATE"
                    ? "border-brand-violet bg-brand-violet/5 ring-1 ring-brand-violet"
                    : "border-brand-line bg-brand-canvas hover:border-brand-navy/30",
                )}
              >
                <Lock className="size-4 shrink-0 text-brand-violet" />
                <span className="text-sm font-semibold text-brand-navy">{t.visibilityPrivate}</span>
              </button>

              <button
                type="button"
                onClick={() => setVisibility("PUBLIC")}
                className={cn(
                  "flex items-center gap-2 rounded-2xl border p-3.5 text-left transition-all active:scale-95",
                  visibility === "PUBLIC"
                    ? "border-brand-violet bg-brand-violet/5 ring-1 ring-brand-violet"
                    : "border-brand-line bg-brand-canvas hover:border-brand-navy/30",
                )}
              >
                <Globe className="size-4 shrink-0 text-brand-slate" />
                <span className="text-sm font-semibold text-brand-navy">{t.visibilityPublic}</span>
              </button>
            </div>
          </div>

          {/* Preferred Payout Round */}
          <div>
            <label className="text-sm font-semibold text-brand-navy block mb-1">{t.payoutRound}</label>
            <p className="text-xs text-brand-slate mb-2">{t.payoutRoundHelp}</p>
            <div className="flex flex-wrap gap-2">
              {rounds.map((r) => (
                <button
                  type="button"
                  key={r}
                  onClick={() => setPayoutRound(r)}
                  className={cn(
                    "flex h-9 min-w-10 items-center justify-center rounded-xl border px-3 text-xs font-semibold transition-all active:scale-95",
                    payoutRound === r
                      ? "border-brand-violet bg-brand-violet text-brand-white shadow-2xs"
                      : "border-brand-line bg-brand-canvas text-brand-navy hover:border-brand-navy/30",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <Button
            type="submit"
            disabled={isPending}
            className="h-12 w-full rounded-full bg-brand-violet px-6 text-sm font-semibold text-brand-white shadow-[0_6px_20px_-8px_var(--color-brand-violet)] transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-brand-violet-ink focus-visible:ring-4 focus-visible:ring-brand-violet/30 active:translate-y-0 sm:w-auto"
          >
            {isPending ? (
              <>
                <LoaderCircle className="size-4 shrink-0 animate-spin" />
                <span>{t.creating}</span>
              </>
            ) : (
              <>
                <Sparkles className="size-4 shrink-0" />
                <span>{t.submit}</span>
              </>
            )}
          </Button>

          {state.error && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-2xl bg-destructive/10 border border-destructive/20 p-4 text-xs font-semibold text-destructive animate-in fade-in zoom-in-95"
            >
              <span>{state.error}</span>
            </div>
          )}
        </form>
      </div>

      {/* Live Financial Projection Card (Bento Aside) */}
      <aside className="rounded-[32px] border border-brand-navy bg-brand-navy p-6 text-brand-white shadow-sm sm:p-8 lg:col-span-5" aria-live="polite">
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-white/10 px-3 py-1 text-xs font-semibold text-brand-mint">
            <Zap className="size-3 text-brand-mint" />
            <span>{t.preview}</span>
          </div>
          <Coins className="size-5 text-brand-mint" />
        </div>

        <div className="mt-6">
          <p className="text-xs font-medium text-brand-on-navy">{t.payoutLine}</p>
          <p className="mt-1 font-mono text-4xl font-extrabold tracking-tight text-brand-mint tabular-nums">
            {money(payout)}
          </p>
          <p className="mt-1 text-xs text-brand-on-navy">
            {locale === "es" ? "Monto neto entregado a cada participante en su turno" : "Net amount paid to each member on their round"}
          </p>
        </div>

        <dl className="mt-8 space-y-3 rounded-2xl bg-brand-white/5 p-4 border border-brand-white/10 text-xs">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-brand-on-navy flex items-center gap-1.5">
              <Users className="size-3 text-brand-mint" />
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
          <div className="mt-6 flex items-start gap-2.5 rounded-xl bg-brand-white/5 p-3 text-xs leading-relaxed text-brand-on-navy border border-brand-white/10">
            <CheckCircle2 className="size-4 shrink-0 text-brand-mint mt-0.5" />
            <p>{fill(t.totalLine, { size: members.toString(), paid: money(pot), received: money(payout) })}</p>
          </div>
        )}
      </aside>
    </div>
  )
}
