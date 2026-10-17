"use client"

import { useActionState } from "react"
import { CheckCircle2, LoaderCircle, Mail } from "lucide-react"
import { FormField, describedBy } from "@/components/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { fill, type Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import { sendMagicLink, type LoginState } from "./actions"

type Props = {
  locale: Locale
  t: Dictionary["auth"]
  linkError: boolean
  /** In-app path to return to after sign-in; validated again on the server. */
  next: string | null
}

/** Magic link only: the email gets a sign-in link; new emails get an account on first use. */
export function LoginForm({ locale, t, linkError, next }: Props) {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink.bind(null, locale), { status: "idle" })

  if (state.status === "sent") {
    return (
      <div
        role="status"
        className="oc-fade-in rounded-[28px] border border-brand-mint bg-brand-mint/30 p-6 text-center text-brand-navy shadow-xs"
      >
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-brand-white text-brand-navy shadow-2xs">
          <CheckCircle2 className="size-6 text-brand-navy" aria-hidden="true" />
        </div>
        <p className="mt-4 text-sm leading-relaxed text-brand-navy/90">{fill(t.sent, { email: state.email })}</p>
      </div>
    )
  }

  const emailError = state.status === "error" && state.error === "email" ? t.errors.email : undefined
  const formError =
    state.status === "error" && state.error === "send" ? t.errors.send : linkError && state.status === "idle" ? t.errors.link : undefined

  return (
    <form action={action} noValidate className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}

      <FormField id="email" label={t.email} error={emailError}>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-brand-slate" aria-hidden="true" />
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder={t.emailPlaceholder}
            aria-invalid={emailError ? true : undefined}
            aria-describedby={describedBy("email", emailError)}
            className="h-11 rounded-xl pl-10 text-base"
          />
        </div>
      </FormField>

      {formError && (
        <p role="alert" className="oc-fade-in rounded-xl bg-brand-mist p-3 text-sm font-medium text-brand-violet-ink">
          {formError}
        </p>
      )}

      <Button
        type="submit"
        disabled={pending}
        className="mt-2 h-12 w-full rounded-full bg-brand-violet px-5 text-sm font-semibold text-brand-white shadow-[0_6px_20px_-8px_var(--color-brand-violet)] transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-brand-violet-ink focus-visible:ring-4 focus-visible:ring-brand-violet/30 active:translate-y-0"
      >
        {pending && <LoaderCircle className="motion-safe:animate-spin" aria-hidden="true" />}
        {pending ? t.sending : t.send}
      </Button>
    </form>
  )
}
