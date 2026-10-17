"use client"

import { useActionState } from "react"
import { Loader2, RotateCw } from "lucide-react"
import type { Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import { settleFailedContributionAction, type PaymentActionState } from "./actions"

type Props = {
  locale: Locale
  contributionId: string
  mode: "retry" | "debt"
  label: string
  errors: Dictionary["account"]["next"]["retryErrors"]
}

const initial: PaymentActionState = { error: null, done: false }

export function RetryPaymentButton({ locale, contributionId, mode, label, errors }: Props) {
  const [state, submit, pending] = useActionState(
    settleFailedContributionAction.bind(null, locale, contributionId, mode),
    initial,
  )

  return (
    <div className="flex flex-col items-start gap-2">
      <form action={submit}>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-brand-violet px-5 text-sm font-semibold text-brand-white transition-colors hover:bg-brand-violet-ink focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <RotateCw className="size-4" aria-hidden="true" />
          )}
          <span>{label}</span>
        </button>
      </form>
      {state.error && (
        <p role="alert" className="text-xs font-medium text-brand-violet-ink">
          {errors[state.error]}
        </p>
      )}
    </div>
  )
}
