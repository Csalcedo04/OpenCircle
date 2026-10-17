"use client"

import { useActionState } from "react"
import { LoaderCircle, Wallet } from "lucide-react"
import { FormField, describedBy } from "@/components/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import { TESTNET_WALLET_PREFIX } from "@/lib/flows/wallet-consent"
import { connectWallet, type WalletState } from "./actions"

type Props = {
  locale: Locale
  t: Pick<Dictionary["onboarding"], "wallet" | "walletHelp" | "walletPlaceholder" | "connect" | "connecting" | "errors">
  /** Where the consent callback lands afterwards (an in-app path), or null for the default. */
  returnPath: string | null
  /** Error from a failed consent round trip (e.g. the user declined in their wallet). */
  initialError: WalletState["error"]
}

/** Links the user's own Open Payments wallet; used in onboarding and on the account page. */
export function WalletForm({ locale, t, returnPath, initialError }: Props) {
  const [state, action, pending] = useActionState<WalletState, FormData>(connectWallet.bind(null, locale, returnPath), {
    error: initialError,
  })
  const error = state.error ? t.errors[state.error] : undefined

  return (
    <form action={action} noValidate className="space-y-6">
      <FormField id="wallet" label={t.wallet} help={t.walletHelp} error={error}>
        {/* Prefix + username in one field: users only remember their username. */}
        <div
          className="flex h-11 min-w-0 items-center overflow-hidden rounded-lg border border-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-aria-invalid:border-destructive has-aria-invalid:ring-3 has-aria-invalid:ring-destructive/20"
        >
          <span
            aria-hidden="true"
            className="flex h-full shrink-0 items-center border-r border-input bg-brand-mist px-2.5 text-xs text-brand-navy/70 select-none sm:px-3 sm:text-sm"
          >
            {TESTNET_WALLET_PREFIX}
          </span>
          <Input
            id="wallet"
            name="wallet"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            placeholder={t.walletPlaceholder}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy("wallet", error)}
            className="h-full rounded-none border-0 text-base focus-visible:ring-0 aria-invalid:ring-0"
          />
        </div>
      </FormField>
      <Button type="submit" disabled={pending} className="h-11 w-full px-5 text-base sm:w-auto">
        {pending ? <LoaderCircle className="motion-safe:animate-spin" aria-hidden="true" /> : <Wallet aria-hidden="true" />}
        {pending ? t.connecting : t.connect}
      </Button>
    </form>
  )
}
