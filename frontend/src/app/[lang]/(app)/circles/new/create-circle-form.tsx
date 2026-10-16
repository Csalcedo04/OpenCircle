"use client"

import { useState, type FormEvent } from "react"
import { CheckCircle2, CircleCheck, Coins, Sparkles, Users, Zap } from "lucide-react"
import { FormField, describedBy } from "@/components/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { fill, type Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import { amount, applyBps, formatAmount, parseWholeUnits } from "@/lib/domain/money"
import { cn } from "@/lib/utils"

const COP = { assetCode: "COP", assetScale: 2 } as const
const FEE_BPS = 200
const MIN = parseWholeUnits("1000", COP.assetScale) ?? 0n
const MAX = parseWholeUnits("10000000", COP.assetScale) ?? 0n

type Props = { locale: Locale; t: Dictionary["create"] }
type Field = "name" | "amount" | "size" | "frequency"

const SIZES = ["3", "5", "8", "10", "12"]

export function CreateCircleForm({ locale, t }: Props) {
  const [name, setName] = useState("")
  const [amountInput, setAmountInput] = useState("20000")
  const [size, setSize] = useState("5")
  const [frequency, setFrequency] = useState("7")
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const [created, setCreated] = useState(false)

  const contribution = parseWholeUnits(amountInput, COP.assetScale)
  const members = /^\d{1,2}$/.test(size) ? BigInt(size) : 0n
  const pot = contribution !== null ? contribution * members : 0n
  const fee = applyBps(pot, FEE_BPS)
  const payout = pot - fee
  const money = (v: bigint) => formatAmount(amount(v, COP), locale)

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next: Partial<Record<Field, string>> = {}

    if (name.trim().length < 3 || name.trim().length > 60) next.name = t.errors.name
    if (!contribution || contribution < MIN || contribution > MAX) next.amount = t.errors.amount
    const sizeNum = Number(size)
    if (!sizeNum || sizeNum < 3 || sizeNum > 12) next.size = t.errors.size
    const freqNum = Number(frequency)
    if (!freqNum || freqNum < 1 || freqNum > 60) next.frequency = t.errors.frequency

    if (Object.keys(next).length > 0) {
      setErrors(next)
      setCreated(false)
      return
    }

    setErrors({})
    setCreated(true)
  }

  return (
    <div className="grid gap-8 lg:grid-cols-12 items-start">
      {/* Form Parameters Bento Card */}
      <div className="rounded-[32px] border border-brand-line bg-brand-white p-6 shadow-2xs sm:p-8 lg:col-span-7">
        <form onSubmit={onSubmit} noValidate className="space-y-6">
          <FormField id="name" label={t.name} error={errors.name}>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.namePlaceholder}
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={describedBy("name", errors.name)}
              className="h-11 rounded-xl text-base"
            />
          </FormField>

          <FormField id="amount" label={t.amount} help={t.amountHelp} error={errors.amount}>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-sm text-brand-slate">
                $
              </span>
              <Input
                id="amount"
                inputMode="numeric"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                aria-invalid={errors.amount ? true : undefined}
                aria-describedby={describedBy("amount", errors.amount)}
                className="h-11 rounded-xl pl-8 text-base tabular-nums font-mono"
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
                  onClick={() => setSize(s)}
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
            {errors.size && <p className="mt-1 text-xs text-destructive">{errors.size}</p>}
          </div>

          <FormField id="frequency" label={t.frequency} error={errors.frequency}>
            <div className="flex items-center gap-2">
              <Input
                id="frequency"
                type="number"
                min={1}
                max={60}
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                aria-invalid={errors.frequency ? true : undefined}
                aria-describedby={describedBy("frequency", errors.frequency)}
                className="h-11 w-32 rounded-xl text-base font-mono"
              />
              <span className="text-sm text-brand-slate">{locale === "es" ? "días por turno" : "days per round"}</span>
            </div>
          </FormField>

          <Button
            type="submit"
            className="h-12 w-full rounded-full bg-brand-violet px-6 text-sm font-semibold text-brand-white shadow-[0_6px_20px_-8px_var(--color-brand-violet)] transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-brand-violet-ink focus-visible:ring-4 focus-visible:ring-brand-violet/30 active:translate-y-0 sm:w-auto"
          >
            <Sparkles className="size-4 shrink-0" />
            <span>{t.submit}</span>
          </Button>

          {created && (
            <div
              role="status"
              className="flex items-start gap-3 rounded-2xl bg-brand-mint/40 border border-brand-mint p-4 text-xs font-semibold text-brand-navy animate-in fade-in zoom-in-95"
            >
              <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{t.created}</span>
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
