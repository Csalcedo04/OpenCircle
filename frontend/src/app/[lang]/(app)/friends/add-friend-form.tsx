"use client"

import { useActionState } from "react"
import { LoaderCircle, UserPlus } from "lucide-react"
import { FormField, describedBy } from "@/components/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { fill, type Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import { sendFriendRequestAction, type FriendFormState } from "./actions"

type Props = { locale: Locale; t: Dictionary["friends"] }

/** Sends a friend request to an exact email. */
export function AddFriendForm({ locale, t }: Props) {
  const [state, action, pending] = useActionState<FriendFormState, FormData>(sendFriendRequestAction.bind(null, locale), { error: null, sentTo: null })
  const fieldError = state.error === "email" ? t.errors.email : undefined

  return (
    <form action={action} noValidate className="space-y-4">
      <FormField id="friend-email" label={t.email} help={t.emailHelp} error={fieldError}>
        <Input
          id="friend-email"
          name="email"
          type="email"
          autoComplete="off"
          placeholder={t.emailPlaceholder}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={describedBy("friend-email", fieldError)}
          className="h-11 rounded-xl text-base"
        />
      </FormField>

      {state.error && state.error !== "email" && (
        <p role="alert" className="oc-fade-in rounded-xl bg-brand-mist p-3 text-sm font-medium text-brand-violet-ink">
          {t.errors[state.error]}
        </p>
      )}
      {state.sentTo && !state.error && (
        <p role="status" className="oc-fade-in rounded-xl bg-brand-mint/40 p-3 text-sm font-medium text-brand-navy">
          {fill(t.sent, { email: state.sentTo })}
        </p>
      )}

      <Button
        type="submit"
        disabled={pending}
        className="h-11 w-full rounded-full bg-brand-violet px-6 text-sm font-semibold text-brand-white transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-brand-violet-ink focus-visible:ring-4 focus-visible:ring-brand-violet/30 active:translate-y-0 sm:w-auto"
      >
        {pending ? <LoaderCircle className="size-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" /> : <UserPlus className="size-4 shrink-0" aria-hidden="true" />}
        <span>{pending ? t.sending : t.send}</span>
      </Button>
    </form>
  )
}
