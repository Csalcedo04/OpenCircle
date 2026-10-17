"use client"

import { useActionState } from "react"
import { LoaderCircle, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import { payDepositAction, type DepositState } from "../../actions"

type Props = {
  locale: Locale
  depositId: string
  t: Dictionary["account"]["deposit"]
}

/** One click: the linked wallet pays the deposit's incoming payment through the standing grant. */
export function PayWithWalletForm({ locale, depositId, t }: Props) {
  const [state, action, pending] = useActionState<DepositState, FormData>(payDepositAction.bind(null, locale, depositId), { error: null })

  return (
    <form action={action}>
      <Button type="submit" disabled={pending} className="h-11 w-full px-5 text-base sm:w-auto">
        {pending ? <LoaderCircle className="motion-safe:animate-spin" aria-hidden="true" /> : <Wallet aria-hidden="true" />}
        {pending ? t.paying : t.payWithWallet}
      </Button>
      {state.error && (
        <p role="alert" className="mt-3 text-sm font-medium text-brand-violet-ink">
          {t.errors[state.error]}
        </p>
      )}
    </form>
  )
}
