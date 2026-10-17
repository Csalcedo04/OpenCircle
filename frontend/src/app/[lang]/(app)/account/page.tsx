import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { ServiceUnavailable } from "@/components/service-unavailable"
import { getDictionary } from "@/i18n/get-dictionary"
import { getMyDashboard, getMyKyc, getMyProfile, isBackendUnavailable } from "@/lib/api/backend"
import { nextAction } from "@/lib/flows/account-dashboard"
import { createClient } from "@/lib/supabase/server"
import {
  AccountHeader,
  CircleFundingProgress,
  CommunityTrustCard,
  ConnectedWalletCard,
  DemoNotice,
  FinancialOverview,
  MyCirclesSummary,
  NextActionCard,
  PersonalProfileCard,
  RecentTransactions,
  UpcomingPayoutCard,
} from "./sections"

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary()
  return { title: t.account.title }
}

export default async function AccountPage() {
  const { locale, t } = await getDictionary()
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims) redirect(`/${locale}/login`)

  let loaded
  try {
    // Every figure comes from the backend's records; this page never changes a payment.
    loaded = await Promise.all([getMyProfile(), getMyKyc().catch(() => null), getMyDashboard()])
  } catch (err) {
    if (!isBackendUnavailable(err)) throw err
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <AccountHeader t={t.account} locale={locale} />
        <div className="mt-8">
          <ServiceUnavailable t={t.common} retryHref={`/${locale}/account`} />
        </div>
      </div>
    )
  }
  const [profile, kyc, dashboard] = loaded
  if (!profile || !dashboard) redirect(`/${locale}/onboarding`)

  const a = t.account
  const email = profile.email || data.claims.email || ""
  const kycApproved = kyc?.approved ?? false

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <AccountHeader t={a} locale={locale} />
      <DemoNotice t={a} />
      <FinancialOverview data={dashboard} t={a} locale={locale} />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        <NextActionCard action={nextAction(dashboard)} t={a} locale={locale} />
        <CommunityTrustCard data={dashboard} kycApproved={kycApproved} t={a} />

        <MyCirclesSummary data={dashboard} t={a} locale={locale} />
        {/* Both cards render nothing without an active circle; then the column collapses. */}
        <div className="grid grid-cols-1 content-start gap-6 empty:hidden lg:col-span-5">
          <UpcomingPayoutCard data={dashboard} t={a} roundStates={t.circle.states} locale={locale} />
          <CircleFundingProgress data={dashboard} t={a} locale={locale} />
        </div>

        <ConnectedWalletCard data={dashboard} t={a} locale={locale} />
        <PersonalProfileCard profile={profile} email={email} kycApproved={kycApproved} t={a} locale={locale} />
      </div>

      <RecentTransactions data={dashboard} t={a} locale={locale} />
    </div>
  )
}
