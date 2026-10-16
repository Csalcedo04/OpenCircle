"use client"

import { useActionState } from "react"
import { CircleCheck } from "lucide-react"
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

export function LoginForm({ locale, t, linkError, next }: Props) {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink.bind(null, locale), {
    status: "idle",
  })

  if (state.status === "sent") {
    return (
      <p className="flex items-start gap-2 rounded-2xl bg-brand-mint p-4 text-sm font-medium text-brand-navy" role="status">
        <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {fill(t.sent, { email: state.email })}
      </p>
    )
  }

  const error =
    state.status === "error" ? t.errors[state.error] : linkError && state.status === "idle" ? t.errors.link : undefined

  return (
    <form action={action} noValidate className="space-y-6">
      {next && <input type="hidden" name="next" value={next} />}
      <FormField id="email" label={t.email} error={error}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder={t.emailPlaceholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy("email", error)}
          className="h-11 text-base"
        />
      </FormField>
      <Button type="submit" disabled={pending} className="h-11 w-full px-5 text-base">
        {pending ? t.sending : t.send}
      </Button>
    </form>
  )
}
