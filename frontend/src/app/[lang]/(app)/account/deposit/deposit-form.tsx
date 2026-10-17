"use client"

import { useActionState } from "react"
import { ArrowDownToLine, LoaderCircle } from "lucide-react"
import { FormField, describedBy } from "@/components/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import { createDepositAction, type DepositState } from "../actions"

type Props = {
  locale: Locale
  assetCode: string
  assetScale: number
  t: Dictionary["account"]["deposit"]
}

/** Amount in whole units; the action turns it into minor units and opens the incoming payment. */
export function DepositForm({ locale, assetCode, assetScale, t }: Props) {
  const [state, action, pending] = useActionState<DepositState, FormData>(createDepositAction.bind(null, locale, assetScale), { error: null })
  const error = state.error ? t.errors[state.error] : undefined

  return (
    <form action={action} noValidate className="space-y-6">
      <FormField id="amount" label={`${t.amount} (${assetCode})`} help={t.amountHelp} error={error}>
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-sm text-brand-slate">$</span>
          <Input
            id="amount"
            name="amount"
            inputMode="numeric"
            autoComplete="off"
            required
            placeholder="20.000"
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy("amount", error)}
            className="h-11 rounded-xl pl-8 font-mono text-base tabular-nums"
          />
        </div>
      </FormField>
      <Button type="submit" disabled={pending} className="h-11 w-full px-5 text-base sm:w-auto">
        {pending ? <LoaderCircle className="motion-safe:animate-spin" aria-hidden="true" /> : <ArrowDownToLine aria-hidden="true" />}
        {pending ? t.creating : t.create}
      </Button>
    </form>
  )
}
