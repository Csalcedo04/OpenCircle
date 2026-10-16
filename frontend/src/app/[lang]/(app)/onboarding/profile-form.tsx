"use client"

import { useActionState } from "react"
import { FormField, describedBy } from "@/components/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import { saveProfile, type ProfileState } from "./actions"

type Props = {
  locale: Locale
  t: Dictionary["onboarding"]
  defaults: { fullName: string; phone: string; dob: string }
}

export function ProfileForm({ locale, t, defaults }: Props) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(saveProfile.bind(null, locale), { errors: {} })
  const error = (field: keyof ProfileState["errors"]) => {
    const key = state.errors[field]
    return key ? t.errors[key] : undefined
  }

  return (
    <form action={action} noValidate className="space-y-6">
      <FormField id="fullName" label={t.fullName} error={error("fullName")}>
        <Input
          id="fullName"
          name="fullName"
          autoComplete="name"
          required
          defaultValue={defaults.fullName}
          aria-invalid={error("fullName") ? true : undefined}
          aria-describedby={describedBy("fullName", error("fullName"))}
          className="h-11 text-base"
        />
      </FormField>
      <FormField id="phone" label={t.phone} help={t.phoneHelp} error={error("phone")}>
        <Input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          placeholder="+573001234567"
          defaultValue={defaults.phone}
          aria-invalid={error("phone") ? true : undefined}
          aria-describedby={describedBy("phone", error("phone"))}
          className="h-11 text-base"
        />
      </FormField>
      <FormField id="dob" label={t.dob} error={error("dob")}>
        <Input
          id="dob"
          name="dob"
          type="date"
          autoComplete="bday"
          defaultValue={defaults.dob}
          aria-invalid={error("dob") ? true : undefined}
          aria-describedby={describedBy("dob", error("dob"))}
          className="h-11 text-base"
        />
      </FormField>
      {error("form") && (
        <p role="alert" className="text-sm font-medium text-brand-violet-ink">
          {error("form")}
        </p>
      )}
      <Button type="submit" disabled={pending} className="h-11 w-full px-5 text-base sm:w-auto">
        {pending ? t.saving : t.saveProfile}
      </Button>
    </form>
  )
}
