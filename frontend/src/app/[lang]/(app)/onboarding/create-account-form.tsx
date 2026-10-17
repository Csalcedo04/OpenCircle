"use client"

import { useActionState } from "react"
import { LoaderCircle, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import { createInternalAccount, type AccountState } from "./actions"

type Props = {
  locale: Locale
  /** Where to land afterwards (an in-app path), or null for the default. */
  returnPath: string | null
  t: Pick<Dictionary["onboarding"], "accountOption" | "errors">
}

/** One click: creates the user's OpenCircle account (seeded with test funds in the demo). */
export function CreateAccountForm({ locale, returnPath, t }: Props) {
  const [state, action, pending] = useActionState<AccountState, FormData>(createInternalAccount.bind(null, locale, returnPath), {
    error: null,
  })

  return (
    <form action={action}>
      <Button type="submit" disabled={pending} className="h-11 w-full px-5 text-base sm:w-auto">
        {pending ? <LoaderCircle className="motion-safe:animate-spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
        {pending ? t.accountOption.creating : t.accountOption.cta}
      </Button>
      {state.error && (
        <p role="alert" className="mt-3 text-sm font-medium text-brand-violet-ink">
          {t.errors[state.error]}
        </p>
      )}
    </form>
  )
}
