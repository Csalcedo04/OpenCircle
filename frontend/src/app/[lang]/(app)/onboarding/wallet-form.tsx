"use client"

import { useActionState } from "react"
import { Wallet } from "lucide-react"
import { FormField, describedBy } from "@/components/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import { connectWallet, type WalletState } from "./actions"

type Props = {
  locale: Locale
  t: Dictionary["onboarding"]
  /** Error from a failed consent round trip (e.g. the user declined in their wallet). */
  initialError: WalletState["error"]
}

export function WalletForm({ locale, t, initialError }: Props) {
  const [state, action, pending] = useActionState<WalletState, FormData>(connectWallet.bind(null, locale), {
    error: initialError,
  })
  const error = state.error ? t.errors[state.error] : undefined

  return (
    <form action={action} noValidate className="space-y-6">
      <FormField id="wallet" label={t.wallet} help={t.walletHelp} error={error}>
        <Input
          id="wallet"
          name="wallet"
          autoComplete="off"
          spellCheck={false}
          required
          placeholder={t.walletPlaceholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy("wallet", error)}
          className="h-11 text-base"
        />
      </FormField>
      <Button type="submit" disabled={pending} className="h-11 w-full px-5 text-base sm:w-auto">
        <Wallet aria-hidden="true" />
        {pending ? t.connecting : t.connect}
      </Button>
    </form>
  )
}
