"use client"

import { useState } from "react"
import { Award, ChevronRight, ShieldCheck, Sparkles, Wallet, X } from "lucide-react"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { fill } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import type { Dashboard } from "@/lib/api/backend"
import { reliability } from "@/lib/flows/account-dashboard"
import { cn } from "@/lib/utils"

interface CreditPassportModalProps {
  data: Dashboard
  kycApproved: boolean
  t: Dictionary["account"]["trust"]
  authLabels: Dictionary["account"]["wallet"]["auth"]
}

export function CreditPassportModal({ data, kycApproved, t, authLabels }: CreditPassportModalProps) {
  const [open, setOpen] = useState(false)
  const score = data.ics
  const rate = reliability(data.record)
  const { onTime, late } = data.record.payments
  const circlesCompleted = data.record.circlesCompleted
  const authStatus = data.wallet?.authorization.status ?? "NONE"

  const tierKey =
    score === null
      ? ("BUILDING" as const)
      : score >= 75
        ? ("EXCELLENT" as const)
        : score >= 60
          ? ("GOOD" as const)
          : ("FAIR" as const)

  const tierColors = {
    EXCELLENT: "bg-brand-mint text-brand-navy border-brand-mint",
    GOOD: "bg-brand-violet/10 text-brand-violet-ink border-brand-violet/20",
    FAIR: "bg-brand-canvas text-brand-navy border-brand-line",
    BUILDING: "bg-brand-mist text-brand-slate border-brand-line",
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-mint transition-colors hover:text-brand-white hover:underline active:scale-95">
        <Sparkles className="size-3.5 text-brand-mint" aria-hidden="true" />
        <span>{t.passportCta}</span>
        <ChevronRight className="size-3 text-brand-mint" aria-hidden="true" />
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-brand-violet/20 bg-brand-violet/10 px-3 py-1 text-xs font-semibold text-brand-violet-ink">
              <ShieldCheck className="size-3.5 text-brand-violet" aria-hidden="true" />
              <span>{t.title}</span>
            </div>
            <DialogTitle className="mt-3 text-xl font-bold tracking-tight text-brand-navy sm:text-2xl">
              {t.passportTitle}
            </DialogTitle>
            <DialogDescription className="mt-1 text-xs leading-relaxed text-brand-slate sm:text-sm">
              {t.passportLead}
            </DialogDescription>
          </div>
          <DialogClose
            className="rounded-full p-1.5 text-brand-slate transition-colors hover:bg-brand-canvas hover:text-brand-navy"
            aria-label={t.close}
          >
            <X className="size-5" />
          </DialogClose>
        </div>

        {/* Score & Tier Bento Hero */}
        <div className="mt-6 rounded-2xl border border-brand-navy bg-brand-navy p-5 text-brand-white">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-on-navy">{t.tier}</span>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold",
                tierColors[tierKey],
              )}
            >
              <Award className="size-3.5" aria-hidden="true" />
              {t.tiers[tierKey]}
            </span>
          </div>

          <div className="mt-4 flex items-baseline gap-2">
            <span className="font-mono text-5xl font-extrabold tracking-tight text-brand-mint tabular-nums">
              {score === null ? "—" : Math.round(score)}
            </span>
            <span className="text-sm font-medium text-brand-on-navy">{t.outOf}</span>
          </div>

          <p className="mt-2 text-xs text-brand-on-navy">
            {score === null ? t.buildingBody : t.disclaimer}
          </p>
        </div>

        {/* Breakdown Stats */}
        <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <div className="rounded-xl border border-brand-line/80 bg-brand-white p-3">
            <dt className="text-brand-slate">{t.onTime}</dt>
            <dd className="mt-1 font-mono text-lg font-bold text-brand-navy tabular-nums">+{onTime * 5}</dd>
            <p className="mt-0.5 text-[10px] text-brand-slate">{fill(t.paymentsCount, { count: onTime })}</p>
          </div>
          <div className="rounded-xl border border-brand-line/80 bg-brand-white p-3">
            <dt className="text-brand-slate">{t.verified}</dt>
            <dd className="mt-1 font-mono text-lg font-bold text-brand-navy tabular-nums">{onTime + late}</dd>
            <p className="mt-0.5 text-[10px] text-brand-slate">{t.confirmedSub}</p>
          </div>
          <div className="rounded-xl border border-brand-line/80 bg-brand-white p-3">
            <dt className="text-brand-slate">{t.completedCircles}</dt>
            <dd className="mt-1 font-mono text-lg font-bold text-brand-navy tabular-nums">{circlesCompleted}</dd>
            <p className="mt-0.5 text-[10px] text-brand-slate">{t.completedSub}</p>
          </div>
          <div className="rounded-xl border border-brand-line/80 bg-brand-white p-3">
            <dt className="text-brand-slate">{t.reliability}</dt>
            <dd className="mt-1 font-mono text-lg font-bold text-brand-navy tabular-nums">
              {rate === null ? "—" : `${rate}%`}
            </dd>
            <p className="mt-0.5 text-[10px] text-brand-slate">{t.reliabilitySub}</p>
          </div>
        </dl>

        {/* Open Payments Debit Mandate & Identity */}
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between rounded-xl border border-brand-line/80 bg-brand-canvas p-3.5">
            <div className="flex items-center gap-2.5">
              <Wallet className="size-4 text-brand-violet" aria-hidden="true" />
              <div>
                <p className="text-xs font-semibold text-brand-navy">{t.walletStatusTitle}</p>
                <p className="text-[11px] text-brand-slate">
                  {authStatus === "ACTIVE" ? t.walletActive : t.walletInactive}
                </p>
              </div>
            </div>
            <span
              className={cn(
                "inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                authStatus === "ACTIVE" ? "bg-brand-mint text-brand-navy" : "bg-brand-mist text-brand-slate",
              )}
            >
              {authLabels[authStatus]}
            </span>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-brand-line/80 bg-brand-white p-3.5">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="size-4 text-brand-violet" aria-hidden="true" />
              <div>
                <p className="text-xs font-semibold text-brand-navy">{t.identity}</p>
                <p className="text-[11px] text-brand-slate">{t.kycProvider}</p>
              </div>
            </div>
            <span
              className={cn(
                "inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                kycApproved ? "bg-brand-mint text-brand-navy" : "bg-brand-mist text-brand-slate",
              )}
            >
              {kycApproved ? t.identityApproved : t.identityPending}
            </span>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <DialogClose className="inline-flex h-10 items-center justify-center rounded-full bg-brand-violet px-5 text-xs font-semibold text-brand-white hover:bg-brand-violet-ink active:scale-95">
            {t.close}
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  )
}
