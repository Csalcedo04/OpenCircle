"use client"

import { useActionState } from "react"
import Link from "next/link"
import { AlertTriangle, ArrowUpRight, CheckCircle2, Clock, LoaderCircle, ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { fill, type Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import { payDebtAction, type PayDebtState } from "@/lib/actions/debts"
import type { DebtDto } from "@/lib/api/backend"
import { formatAmount } from "@/lib/domain/money"
import { cn } from "@/lib/utils"
import { formatDate } from "@/lib/view"

interface DebtsCardProps {
  debts: DebtDto[]
  locale: Locale
  t: Dictionary["account"]["debts"]
}

const INITIAL_STATE: PayDebtState = { error: null, status: "IDLE" }

function DebtItem({ debt, locale, t }: { debt: DebtDto; locale: Locale; t: Dictionary["account"]["debts"] }) {
  const [state, action, pending] = useActionState(payDebtAction.bind(null, locale, debt.contributionId), INITIAL_STATE)

  const isPaid = state.status === "PAID"
  const isPaying = pending || state.status === "PAYING" || debt.status === "PAYING"

  return (
    <li className="rounded-2xl border border-brand-line bg-brand-canvas p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/${locale}/circles/${debt.circleId}`}
              className="inline-flex items-center gap-1 text-base font-bold text-brand-navy hover:underline"
            >
              <span>{debt.circleName}</span>
              <ArrowUpRight className="size-3.5 text-brand-slate" aria-hidden="true" />
            </Link>
            <span className="rounded-full bg-brand-mist px-2.5 py-0.5 text-xs font-semibold text-brand-navy">
              {fill(t.round, { round: debt.roundNumber })}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider",
                isPaid
                  ? "bg-brand-mint text-brand-navy"
                  : isPaying
                    ? "bg-brand-navy text-brand-white"
                    : "bg-brand-violet/15 text-brand-violet-ink",
              )}
            >
              {isPaid ? (
                <CheckCircle2 className="size-3" aria-hidden="true" />
              ) : isPaying ? (
                <Clock className="size-3" aria-hidden="true" />
              ) : (
                <AlertTriangle className="size-3" aria-hidden="true" />
              )}
              <span>{isPaid ? t.statusPaid : isPaying ? t.statusPaying : t.statusOwed}</span>
            </span>
          </div>
          <p className="mt-1 text-xs font-medium text-brand-slate">
            {fill(t.due, { date: formatDate(debt.deadline, locale) })}
          </p>
        </div>

        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
          <p className="font-mono text-lg font-bold tracking-tight text-brand-navy tabular-nums">
            {formatAmount(debt.amount, locale)}
          </p>
          {!isPaid && (
            <form action={action} className="w-full sm:w-auto">
              <Button
                type="submit"
                disabled={isPaying}
                className="h-11 w-full rounded-full bg-brand-violet px-5 text-xs font-semibold text-brand-white shadow-[0_8px_20px_-8px_var(--color-brand-violet)] transition-all hover:-translate-y-0.5 hover:bg-brand-violet-ink active:translate-y-0 sm:w-auto"
              >
                {isPaying && <LoaderCircle className="size-3.5 shrink-0 motion-safe:animate-spin" aria-hidden="true" />}
                <span>{isPaying ? t.payingCta : t.payCta}</span>
              </Button>
            </form>
          )}
        </div>
      </div>

      {isPaid && (
        <p role="status" className="mt-3 rounded-xl bg-brand-mint/45 px-3.5 py-2.5 text-xs font-semibold text-brand-navy">
          {t.paidNotice}
        </p>
      )}
      {!isPaid && state.status === "PAYING" && (
        <p role="status" className="mt-3 rounded-xl bg-brand-mist px-3.5 py-2.5 text-xs font-medium text-brand-navy">
          {t.payingNotice}
        </p>
      )}
      {state.error && (
        <p role="alert" className="mt-3 rounded-xl bg-brand-violet/10 px-3.5 py-2.5 text-xs font-semibold text-brand-violet-ink">
          {t.errors[state.error]}
        </p>
      )}
    </li>
  )
}

export function DebtsCard({ debts, locale, t }: DebtsCardProps) {
  if (debts.length === 0) return null

  return (
    <section
      aria-labelledby="debts-heading"
      className="relative isolate overflow-hidden rounded-[32px] border border-brand-violet/35 bg-brand-white p-6 shadow-[0_24px_48px_-28px_color-mix(in_srgb,var(--color-brand-violet)_22%,transparent)] sm:p-8 lg:col-span-12"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-45 select-none">
        <svg viewBox="0 0 1200 320" fill="none" className="h-full w-full">
          <circle cx="1080" cy="80" r="160" stroke="color-mix(in srgb, var(--color-brand-violet) 28%, transparent)" strokeWidth="1.5" strokeDasharray="5 7" />
          <circle cx="1080" cy="80" r="240" stroke="var(--color-brand-line)" strokeWidth="1" />
        </svg>
      </div>

      <div className="flex items-start gap-3.5">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand-violet/12 text-brand-violet-ink">
          <ShieldAlert className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-violet-ink">{t.eyebrow}</p>
          <h2 id="debts-heading" className="mt-1 text-xl font-bold tracking-tight text-brand-navy">
            {t.title}
          </h2>
          <p className="mt-1 max-w-[65ch] text-sm leading-relaxed text-brand-slate">{t.lead}</p>
        </div>
      </div>

      <ul className="mt-5 space-y-3">
        {debts.map((debt) => (
          <DebtItem key={debt.contributionId} debt={debt} locale={locale} t={t} />
        ))}
      </ul>
    </section>
  )
}
