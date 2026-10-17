import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { ServiceUnavailable } from "@/components/service-unavailable"
import { getDictionary } from "@/i18n/get-dictionary"
import { getMyInternalAccount, isBackendUnavailable } from "@/lib/api/backend"
import { formatAmount } from "@/lib/domain/money"
import { createClient } from "@/lib/supabase/server"
import { DepositForm } from "./deposit-form"

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary()
  return { title: t.account.deposit.title }
}

/** Step 1 of a deposit: how much. The next page shows where to pay. */
export default async function DepositPage() {
  const { locale, t } = await getDictionary()
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims) redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/account/deposit`)}`)

  let account
  try {
    account = await getMyInternalAccount()
  } catch (err) {
    if (!isBackendUnavailable(err)) throw err
    return (
      <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
        <ServiceUnavailable t={t.common} retryHref={`/${locale}/account/deposit`} />
      </div>
    )
  }
  // Without an account there is nothing to deposit into: the account page offers to open one.
  if (!account) redirect(`/${locale}/account`)
  const d = t.account.deposit

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:px-6 sm:py-14">
      <Link href={`/${locale}/account`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t.account.title}
      </Link>
      <div className="mt-6 rounded-[32px] border border-brand-line bg-brand-white p-6 shadow-2xs sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight text-brand-navy">{d.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-brand-slate">{d.lead}</p>
        <p className="mt-4 text-xs text-brand-slate">
          {d.currentBalance} <span className="font-semibold text-brand-navy tabular-nums">{formatAmount(account.balance, locale)}</span>
        </p>
        <div className="mt-6">
          <DepositForm locale={locale} assetCode={account.balance.assetCode} assetScale={account.balance.assetScale} t={d} />
        </div>
      </div>
    </div>
  )
}
