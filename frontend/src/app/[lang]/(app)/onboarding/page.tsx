import type { Metadata } from "next"
import Link from "next/link"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { CircleCheck } from "lucide-react"
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
    <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
      <Stepper current={step} labels={[o.profileTitle, o.walletTitle]} stepText={o.step} />
      <h1 className="mt-6 font-heading text-4xl font-semibold tracking-[-0.03em]">{o.title}</h1>
      <p className="mt-2 text-muted-foreground">{o.lead}</p>

      {step === 1 ? (
        <section key="profile" aria-labelledby="profile-title" className="oc-step-in mt-10">
          <h2 id="profile-title" className="text-xl font-semibold tracking-[-0.02em]">
            {o.profileTitle}
          </h2>
          <div className="mt-6">
            <ProfileForm
              locale={locale}
              t={o}
              profile={profile}
              countries={countryOptions(locale)}
              phone={splitPhone(profile?.phone)}
              maxDob={new Date().toISOString().slice(0, 10)}
            />
          </div>
        </section>
      ) : (
        <div key="wallet" className="oc-step-in">
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
        </div>
      )}
    </div>
  )
}
