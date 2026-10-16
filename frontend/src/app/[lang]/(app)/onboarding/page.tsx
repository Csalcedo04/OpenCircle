import type { Metadata } from "next"
import Link from "next/link"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { CheckCircle2, User, Wallet } from "lucide-react"
import { fill } from "@/i18n/config"
import { getDictionary } from "@/i18n/get-dictionary"
import { ServiceUnavailable } from "@/components/service-unavailable"
import { getMyProfile, isBackendUnavailable, type Profile } from "@/lib/api/backend"
import { countryOptions, splitPhone } from "@/lib/countries"
import { consentMessageKey } from "@/lib/flows/wallet-consent"
import { RETURN_PATH_COOKIE, isInAppPath } from "@/lib/return-path"
import { createClient } from "@/lib/supabase/server"
import { ProfileForm } from "./profile-form"
import { WalletForm } from "./wallet-form"

// Decides on the server whether to redirect (signed in / onboarding state), so it must block
// rather than stream a shell first: streaming would turn the redirect into a visible flash.
export const instant = false

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary()
  return { title: t.onboarding.title }
}

export default async function OnboardingPage({ searchParams }: PageProps<"/[lang]/onboarding">) {
  const { locale, t } = await getDictionary()
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims) redirect(`/${locale}/login`)

  let profile: Profile | null
  try {
    profile = await getMyProfile()
  } catch (err) {
    if (!isBackendUnavailable(err)) throw err
    return (
      <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
        <ServiceUnavailable t={t.common} retryHref={`/${locale}/onboarding`} />
      </div>
    )
  }
  if (profile?.walletAddress) {
    const next = (await cookies()).get(RETURN_PATH_COOKIE)?.value
    redirect(isInAppPath(next) ? next : `/${locale}/circles`)
  }

  const { consent, edit } = await searchParams
  const step = profile && edit !== "profile" ? 2 : 1
  const consentError = consentMessageKey(consent)
  const o = t.onboarding

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:px-6 sm:py-14">
      {/* Stepper Progress Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between text-xs font-semibold text-brand-slate">
          <span>{fill(o.step, { n: step })}</span>
          <span>{step === 1 ? o.profileTitle : o.walletTitle}</span>
        </div>
        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-brand-line">
          <div
            className="h-full bg-brand-violet transition-all duration-300"
            style={{ width: step === 1 ? "50%" : "100%" }}
          />
        </div>
      </div>

      {/* Main Bento Card */}
      <div className="rounded-[32px] border border-brand-line bg-brand-white p-6 shadow-2xs sm:p-8">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-full bg-brand-violet/10 text-brand-violet-ink">
            {step === 1 ? <User className="size-4.5" /> : <Wallet className="size-4.5" />}
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-brand-navy">
              {step === 1 ? o.profileTitle : o.walletTitle}
            </h1>
            <p className="text-xs text-brand-slate">
              {step === 1 ? o.lead : o.walletLead}
            </p>
          </div>
        </div>

        {step === 1 ? (
          <div className="mt-8">
            <ProfileForm
              locale={locale}
              t={o}
              profile={profile}
              countries={countryOptions(locale)}
              phone={splitPhone(profile?.phone)}
              maxDob={new Date().toISOString().slice(0, 10)}
            />
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-brand-mint/40 border border-brand-mint px-4 py-3 text-xs font-medium text-brand-navy">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="size-4 shrink-0 text-brand-navy" aria-hidden="true" />
                <span className="truncate">{fill(o.profileDone, { name: profile?.fullName ?? "" })}</span>
              </div>
              <Link
                href={`/${locale}/onboarding?edit=profile`}
                className="font-semibold text-brand-navy underline underline-offset-2 hover:opacity-80"
              >
                {o.edit}
              </Link>
            </div>

            <div className="mt-6">
              <WalletForm locale={locale} t={o} initialError={consentError} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
