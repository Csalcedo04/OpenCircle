"use client"

import { useActionState } from "react"
import { FormField, describedBy } from "@/components/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import type { Profile } from "@/lib/api/backend"
import { DOCUMENT_TYPES } from "@/lib/domain/identity"
import { saveProfile, type ProfileState } from "./actions"

type Props = {
  locale: Locale
  t: Dictionary["onboarding"]
  /** Existing profile when editing; identity fields are then read-only. */
  profile: Profile | null
}

// Native select styled like Input; there is no shadcn select in this project.
const selectClass =
  "h-11 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm"

export function ProfileForm({ locale, t, profile }: Props) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(saveProfile.bind(null, locale), { errors: {} })
  const error = (field: keyof ProfileState["errors"]) => {
    const key = state.errors[field]
    return key ? t.errors[key] : undefined
  }
  const invalid = (field: keyof ProfileState["errors"]) => ({
    "aria-invalid": error(field) ? true : undefined,
    "aria-describedby": describedBy(field, error(field)),
  })

  return (
    <form action={action} noValidate className="space-y-6">
      <FormField id="fullName" label={t.fullName} error={error("fullName")}>
        <Input id="fullName" name="fullName" autoComplete="name" required defaultValue={profile?.fullName ?? ""} {...invalid("fullName")} className="h-11 text-base" />
      </FormField>

      {profile ? (
        <div className="rounded-2xl bg-brand-mist px-4 py-3 text-sm text-brand-navy">
          <p className="font-medium">
            {t.documentTypes[profile.documentType]} · {profile.documentNumber}
          </p>
          <p className="mt-1 text-brand-navy/70">{t.documentFixed}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <FormField id="documentType" label={t.documentType} error={error("documentType")}>
            <select id="documentType" name="documentType" required defaultValue="cc" {...invalid("documentType")} className={selectClass}>
              {DOCUMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t.documentTypes[type]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField id="documentNumber" label={t.documentNumber} error={error("documentNumber")}>
            <Input id="documentNumber" name="documentNumber" autoComplete="off" spellCheck={false} required {...invalid("documentNumber")} className="h-11 text-base" />
          </FormField>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <FormField id="dob" label={t.dob} error={error("dob")}>
          <Input id="dob" name="dob" type="date" autoComplete="bday" required defaultValue={profile?.dob ?? ""} {...invalid("dob")} className="h-11 text-base" />
        </FormField>
        <FormField id="nationality" label={t.nationality} help={t.nationalityHelp} error={error("nationality")}>
          <Input
            id="nationality"
            name="nationality"
            autoComplete="country"
            maxLength={2}
            required
            defaultValue={profile?.nationality ?? "CO"}
            {...invalid("nationality")}
            className="h-11 text-base uppercase"
          />
        </FormField>
      </div>

      <FormField id="phone" label={t.phone} help={t.phoneHelp} error={error("phone")}>
        <Input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          required
          placeholder="+573001234567"
          defaultValue={profile?.phone ?? ""}
          {...invalid("phone")}
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
