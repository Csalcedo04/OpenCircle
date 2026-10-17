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
import { Stepper } from "./stepper"
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
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      {/* Editorial Authority Header Card */}
      <header className="relative isolate overflow-hidden rounded-3xl bg-brand-navy p-6 text-brand-white shadow-xl sm:p-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-30 select-none"
        >
          <svg viewBox="0 0 900 300" fill="none" className="h-full w-full">
            <circle cx="760" cy="110" r="150" stroke="var(--color-brand-mint)" strokeWidth="1.2" strokeDasharray="5 7" />
            <circle cx="760" cy="110" r="230" stroke="var(--color-brand-violet)" strokeWidth="1" />
            <path d="M 320 270 Q 580 40 880 180" stroke="var(--color-brand-mint)" strokeWidth="1.5" strokeDasharray="4 6" />
          </svg>
        </div>

        <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1 text-[11px] font-bold uppercase tracking-wider text-brand-mint">
          {step === 1 ? <User className="size-3.5" aria-hidden="true" /> : <Wallet className="size-3.5" aria-hidden="true" />}
          <span>{o.title}</span>
        </div>

        <h1 className="mt-3 font-heading text-2xl font-semibold tracking-[-0.03em] text-brand-white sm:text-3xl">
          {step === 1 ? o.profileTitle : o.walletTitle}
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-brand-on-navy sm:text-base">
          {step === 1 ? o.lead : o.walletLead}
        </p>
      </header>

      {/* Main Bento Card */}
      <div className="mt-6 rounded-3xl border border-brand-line bg-brand-white p-6 shadow-sm sm:p-8">
        {/* Progress: fills on arrival, honours reduced motion, marks the current step for screen readers. */}
        <div className="mb-8 rounded-2xl border border-brand-line bg-brand-canvas/60 p-4">
          <Stepper current={step} labels={[o.profileTitle, o.walletTitle]} stepText={o.step} />
        </div>

        {step === 1 ? (
          <div key="profile" className="oc-step-in">
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
          <div key="wallet" className="oc-step-in space-y-6">
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
