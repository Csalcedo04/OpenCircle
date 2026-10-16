"use client"

import { useState, type FormEvent } from "react"
import { CircleCheck } from "lucide-react"
import { z } from "zod"
import { FormField, describedBy } from "@/components/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { fill, type Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import { amount, applyBps, formatAmount, parseWholeUnits } from "@/lib/domain/money"

const COP = { assetCode: "COP", assetScale: 2 } as const
const FEE_BPS = 200
const MIN = parseWholeUnits("1000", COP.assetScale) ?? 0n
const MAX = parseWholeUnits("10000000", COP.assetScale) ?? 0n

type Props = { locale: Locale; t: Dictionary["create"] }
type Field = "name" | "amount" | "size" | "frequency"

export function CreateCircleForm({ locale, t }: Props) {
  const [name, setName] = useState("")
  const [amountInput, setAmountInput] = useState("20000")
  const [size, setSize] = useState("5")
  const [frequency, setFrequency] = useState("7")
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const [created, setCreated] = useState(false)

  const schema = z.object({
    name: z.string().trim().min(3, t.errors.name).max(60, t.errors.name),
    amount: z
      .string()
      .transform((v) => parseWholeUnits(v, COP.assetScale))
      .refine((v): v is bigint => v !== null && v >= MIN && v <= MAX, t.errors.amount),
    size: z.coerce.number<string>().int(t.errors.size).min(3, t.errors.size).max(12, t.errors.size),
    frequency: z.coerce.number<string>().int(t.errors.frequency).min(1, t.errors.frequency).max(60, t.errors.frequency),
  })

  const contribution = parseWholeUnits(amountInput, COP.assetScale)
  const members = /^\d{1,2}$/.test(size) ? BigInt(size) : 0n
  const pot = contribution !== null ? contribution * members : 0n
  const fee = applyBps(pot, FEE_BPS)
  const payout = pot - fee
  const money = (v: bigint) => formatAmount(amount(v, COP), locale)

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = schema.safeParse({ name, amount: amountInput, size, frequency })
    if (!result.success) {
      const next: Partial<Record<Field, string>> = {}
      for (const issue of result.error.issues) {
        const key = issue.path[0]
        if (typeof key === "string" && !(key in next)) next[key as Field] = issue.message
      }
      setErrors(next)
      setCreated(false)
      return
    }
    setErrors({})
    setCreated(true)
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[1.2fr_1fr]">
      <form onSubmit={onSubmit} noValidate className="space-y-6">
        <FormField id="name" label={t.name} error={errors.name}>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.namePlaceholder}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={describedBy("name", errors.name)}
            className="h-11 text-base"
          />
        </FormField>
        <FormField id="amount" label={t.amount} help={t.amountHelp} error={errors.amount}>
          <Input
            id="amount"
            inputMode="numeric"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            aria-invalid={errors.amount ? true : undefined}
            aria-describedby={describedBy("amount", errors.amount)}
            className="h-11 text-base tabular-nums"
          />
        </FormField>
        <div className="grid gap-6 sm:grid-cols-2">
          <FormField id="size" label={t.size} help={t.sizeHelp} error={errors.size}>
            <Input
              id="size"
              type="number"
              min={3}
              max={12}
              value={size}
              onChange={(e) => setSize(e.target.value)}
              aria-invalid={errors.size ? true : undefined}
              aria-describedby={describedBy("size", errors.size)}
              className="h-11 text-base"
            />
          </FormField>
          <FormField id="frequency" label={t.frequency} error={errors.frequency}>
            <Input
              id="frequency"
              type="number"
              min={1}
              max={60}
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              aria-invalid={errors.frequency ? true : undefined}
              aria-describedby={describedBy("frequency", errors.frequency)}
              className="h-11 text-base"
            />
          </FormField>
        </div>
        <Button type="submit" size="lg" className="h-11 px-5 text-base">
          {t.submit}
        </Button>
        {created && (
          <p role="status" className="flex items-start gap-2 rounded-lg bg-brand-baltic-blue px-4 py-3 text-sm text-brand-white-smoke">
            <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {t.created}
          </p>
        )}
      </form>

      <aside className="h-fit rounded-2xl bg-brand-deep-space-blue p-6 text-brand-white-smoke" aria-live="polite">
        <h2 className="font-heading text-xl font-semibold">{t.preview}</h2>
        <dl className="mt-4 space-y-2">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-brand-cool-steel">{t.potLine}</dt>
            <dd className="tabular-nums">{money(pot)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-brand-cool-steel">{t.feeLine}</dt>
            <dd className="tabular-nums">− {money(fee)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-t border-brand-cool-steel/40 pt-2">
            <dt className="font-medium">{t.payoutLine}</dt>
            <dd className="font-heading text-2xl font-semibold tabular-nums">{money(payout)}</dd>
          </div>
        </dl>
        {contribution !== null && members > 0n && (
          <p className="mt-4 text-sm text-brand-cool-steel">
            {fill(t.totalLine, { size: members.toString(), paid: money(pot), received: money(payout) })}
          </p>
        )}
      </aside>
    </div>
  )
}
