import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft, CircleCheck, CircleX, Clock } from "lucide-react"
import { ServiceUnavailable } from "@/components/service-unavailable"
import { StatusRefresher } from "@/components/status-refresher"
import { fill } from "@/i18n/config"
import { getDictionary } from "@/i18n/get-dictionary"
import { BackendError, getDeposit, getMyProfile, isBackendUnavailable, type Deposit } from "@/lib/api/backend"
import { formatAmount } from "@/lib/domain/money"
import { isDepositPending } from "@/lib/flows/deposit"
import { createClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"
import { formatDate } from "@/lib/view"
import { CopyButton } from "../../copy-button"
import { PayWithWalletForm } from "./pay-with-wallet-form"

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary()
  return { title: t.account.deposit.statusTitle }
}

/** Step 2 of a deposit: where to pay, and whether the money arrived. */
export default async function DepositStatusPage({ params }: PageProps<"/[lang]/account/deposits/[id]">) {
  const { id } = await params
  const { locale, t } = await getDictionary()
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims) redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/account`)}`)

  let deposit: Deposit
  let hasWallet = false
  try {
    ;[deposit, hasWallet] = await Promise.all([getDeposit(id), getMyProfile().then((p) => p?.walletAddress !== null && p?.walletAddress !== undefined)])
  } catch (err) {
    if (err instanceof BackendError && err.code === "DEPOSIT_NOT_FOUND") notFound()
    if (!isBackendUnavailable(err)) throw err
    return (
      <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
        <ServiceUnavailable t={t.common} retryHref={`/${locale}/account/deposits/${id}`} />
      </div>
    )
  }
  const d = t.account.deposit
  const pending = isDepositPending(deposit)
  const StatusIcon = deposit.status === "COMPLETED" ? CircleCheck : deposit.status === "FAILED" ? CircleX : Clock

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:px-6 sm:py-14">
      {pending && <StatusRefresher />}
      <Link href={`/${locale}/account`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t.account.title}
      </Link>

      <div className="mt-6 rounded-[32px] border border-brand-line bg-brand-white p-6 shadow-2xs sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-brand-navy">{d.statusTitle}</h1>
          <span
            role="status"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
              deposit.status === "COMPLETED" ? "bg-brand-mint text-brand-navy" : deposit.status === "FAILED" ? "bg-brand-navy text-brand-white" : "bg-brand-mist text-brand-navy",
            )}
          >
            <StatusIcon className="size-3.5" aria-hidden="true" />
            {d.status[deposit.status]}
          </span>
        </div>
        <p className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-brand-navy tabular-nums">{formatAmount(deposit.amount, locale)}</p>

        {pending && (
          <>
            <p className="mt-4 text-sm leading-relaxed text-brand-slate">{d.payLead}</p>
            <div className="mt-4 rounded-2xl border border-brand-line bg-brand-canvas p-3 sm:p-4">
              <p className="text-xs font-medium text-brand-slate">{d.paymentUrl}</p>
              <code className="mt-1 block break-all font-mono text-xs font-semibold text-brand-navy sm:text-sm">{deposit.incomingPaymentUrl}</code>
              <div className="mt-3">
                <CopyButton value={deposit.incomingPaymentUrl} label={d.copy} copiedLabel={d.copied} />
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-brand-slate">{fill(d.receiver, { wallet: deposit.receiverWalletAddress })}</p>
            <p className="mt-1 text-xs leading-relaxed text-brand-slate">{fill(d.expires, { date: formatDate(deposit.expiresAt, locale) })}</p>

            {hasWallet && (
              <div className="mt-6 border-t border-brand-line pt-5">
                <p className="mb-3 text-sm font-semibold text-brand-navy">{d.payWithWalletTitle}</p>
                <PayWithWalletForm locale={locale} depositId={deposit.id} t={d} />
              </div>
            )}
            <p className="mt-5 text-xs text-brand-slate">{d.waiting}</p>
          </>
        )}

        {deposit.status === "COMPLETED" && (
          <p className="mt-4 text-sm leading-relaxed text-brand-slate">
            {fill(d.done, { date: deposit.completedAt ? formatDate(deposit.completedAt, locale) : "" })}
          </p>
        )}
        {deposit.status === "FAILED" && <p className="mt-4 text-sm leading-relaxed text-brand-slate">{d.expired}</p>}

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={`/${locale}/account`} className="text-sm font-semibold text-brand-navy underline underline-offset-2 hover:opacity-80">
            {d.backToAccount}
          </Link>
          {deposit.status === "FAILED" && (
            <Link href={`/${locale}/account/deposit`} className="text-sm font-semibold text-brand-navy underline underline-offset-2 hover:opacity-80">
              {d.again}
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
