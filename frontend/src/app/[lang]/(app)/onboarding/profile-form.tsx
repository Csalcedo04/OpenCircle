"use client"

import { useActionState, useState } from "react"
import { FormField, describedBy } from "@/components/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import type { Profile } from "@/lib/api/backend"
import type { CountryOption, CountryOptions } from "@/lib/countries"
import { DOCUMENT_TYPES } from "@/lib/domain/identity"
import { saveProfile, type ProfileState } from "./actions"

type Props = {
  locale: Locale
  t: Dictionary["onboarding"]
  /** Existing profile when editing; identity fields are then read-only. */
  profile: Profile | null
  /** Built on the server, in the page's language. */
  countries: CountryOptions
  /** The existing phone split for the pickers, if any. */
  phone: { country: string; national: string } | null
  /** Latest selectable birth date (today), YYYY-MM-DD. */
  maxDob: string
}

// Native select styled like Input; there is no shadcn select in this project.
const selectClass =
  "h-11 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm"

function CountryOptionsList({ countries, t, label }: { countries: CountryOptions; t: Props["t"]; label: (c: CountryOption) => string }) {
  return (
    <>
      <optgroup label={t.frequentCountries}>
        {countries.frequent.map((c) => (
          <option key={c.code} value={c.code}>
            {label(c)}
          </option>
        ))}
      </optgroup>
      <optgroup label={t.allCountries}>
        {countries.all.map((c) => (
          <option key={c.code} value={c.code}>
            {label(c)}
          </option>
        ))}
      </optgroup>
    </>
  )
}

export function ProfileForm({ locale, t, profile, countries, phone, maxDob }: Props) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(saveProfile.bind(null, locale), { errors: {} })
  const [nationality, setNationality] = useState(profile?.nationality ?? "CO")
  const [phoneCountry, setPhoneCountry] = useState(phone?.country ?? profile?.nationality ?? "CO")
  // The phone code follows the nationality until the user picks one themselves.
  const [phoneCountryTouched, setPhoneCountryTouched] = useState(phone !== null)
  const flag = (code: string) => countries.all.find((c) => c.code === code)?.flag ?? ""

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
          <Input
            id="dob"
            name="dob"
            type="date"
            autoComplete="bday"
            min="1900-01-01"
            max={maxDob}
            required
            defaultValue={profile?.dob ?? ""}
            {...invalid("dob")}
            className="h-11 text-base"
          />
        </FormField>
        <FormField id="nationality" label={t.nationality} error={error("nationality")}>
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="w-7 shrink-0 text-center text-xl leading-none">
              {flag(nationality)}
            </span>
            <select
              id="nationality"
              name="nationality"
              autoComplete="country"
              required
              value={nationality}
              onChange={(e) => {
                setNationality(e.target.value)
                if (!phoneCountryTouched) setPhoneCountry(e.target.value)
              }}
              {...invalid("nationality")}
              className={selectClass}
            >
              <CountryOptionsList countries={countries} t={t} label={(c) => c.name} />
            </select>
          </div>
        </FormField>
      </div>

      <FormField id="phoneNumber" label={t.phone} help={t.phoneHelp} error={error("phone")}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
          <div className="flex min-w-0 items-center gap-2">
            <span aria-hidden="true" className="w-7 shrink-0 text-center text-xl leading-none">
              {flag(phoneCountry)}
            </span>
            <select
              name="phoneCountry"
              aria-label={t.phoneCountry}
              autoComplete="tel-country-code"
              value={phoneCountry}
              onChange={(e) => {
                setPhoneCountry(e.target.value)
                setPhoneCountryTouched(true)
              }}
              className={selectClass}
            >
              <CountryOptionsList countries={countries} t={t} label={(c) => `+${c.dial} ${c.name}`} />
            </select>
          </div>
          <Input
            id="phoneNumber"
            name="phoneNumber"
            type="tel"
            autoComplete="tel-national"
            inputMode="tel"
            required
            placeholder={t.phonePlaceholder}
            defaultValue={phone?.national ?? ""}
            {...invalid("phone")}
            aria-describedby={describedBy("phoneNumber", error("phone"))}
            className="h-11 text-base"
          />
        </div>
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
