"use client"

import { useActionState } from "react"
import { ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import { startKycVerification, type KycStartState } from "@/app/[lang]/kyc/actions"

type Props = {
  locale: Locale
  returnPath: string
  t: Pick<Dictionary["kyc"], "start" | "starting" | "errors">
}

export function KycStartForm({ locale, returnPath, t }: Props) {
  const [state, action, pending] = useActionState<KycStartState, FormData>(
    startKycVerification.bind(null, locale, returnPath),
    { error: false },
  )
  return (
    <form action={action} className="mt-6 space-y-3">
      <Button type="submit" disabled={pending} className="h-11 w-full px-5 text-base sm:w-auto">
        <ShieldCheck aria-hidden="true" />
        {pending ? t.starting : t.start}
      </Button>
      {state.error && (
        <p role="alert" className="text-sm font-medium text-brand-violet-ink">
          {t.errors.generic}
        </p>
      )}
    </form>
  )
}
