import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { CircleCheck } from "lucide-react"
import { fill } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import { getDictionary } from "@/i18n/get-dictionary"
import { getMyProfile } from "@/lib/api/backend"
import { createClient } from "@/lib/supabase/server"
import { ProfileForm } from "./profile-form"
import { WalletForm } from "./wallet-form"

type ErrorKey = keyof Dictionary["onboarding"]["errors"]

// `?consent=` values set by the consent callback route.
const consentErrors: Record<string, ErrorKey> = {
  rejected: "consentRejected",
  expired: "consentExpired",
  invalid: "consentInvalid",
  taken: "walletTaken",
  error: "generic",
}

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary()
  return { title: t.onboarding.title }
}

export default async function OnboardingPage({ searchParams }: PageProps<"/[lang]/onboarding">) {
  const { locale, t } = await getDictionary()
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims) redirect(`/${locale}/login`)

  const profile = await getMyProfile()
  if (profile?.fullName && profile.wallet) redirect(`/${locale}/circles`)

  const { consent, edit } = await searchParams
  const step = profile?.fullName && edit !== "profile" ? 2 : 1
  const consentError = typeof consent === "string" ? (consentErrors[consent] ?? null) : null
  const o = t.onboarding

  return (
    <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
      <p className="text-sm font-medium text-brand-violet-ink">{fill(o.step, { n: step })}</p>
      <h1 className="mt-2 font-heading text-4xl font-semibold tracking-[-0.03em]">{o.title}</h1>
      <p className="mt-2 text-muted-foreground">{o.lead}</p>

      {step === 1 ? (
        <section aria-labelledby="profile-title" className="mt-10">
          <h2 id="profile-title" className="text-xl font-semibold tracking-[-0.02em]">
            {o.profileTitle}
          </h2>
          <div className="mt-6">
            <ProfileForm
              locale={locale}
              t={o}
              defaults={{ fullName: profile?.fullName ?? "", phone: profile?.phone ?? "", dob: profile?.dob ?? "" }}
            />
          </div>
        </section>
      ) : (
        <>
          <p className="mt-10 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-brand-mint px-4 py-3 text-sm font-medium text-brand-navy">
            <CircleCheck className="size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-words">{fill(o.profileDone, { name: profile?.fullName ?? "" })}</span>
            <Link href={`/${locale}/onboarding?edit=profile`} className="ml-auto underline underline-offset-4">
              {o.edit}
            </Link>
          </p>
          <section aria-labelledby="wallet-title" className="mt-8">
            <h2 id="wallet-title" className="text-xl font-semibold tracking-[-0.02em]">
              {o.walletTitle}
            </h2>
            <p className="mt-2 text-muted-foreground">{o.walletLead}</p>
            <div className="mt-6">
              <WalletForm locale={locale} t={o} initialError={consentError} />
            </div>
          </section>
        </>
      )}
    </div>
  )
}
