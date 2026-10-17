"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Check, Clock, ShieldCheck, UserPlus, X } from "lucide-react"
import { MemberAvatar } from "@/components/member-avatar"
import type { Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import type { Circle, CircleApplication, VoteDecision } from "@/lib/domain/types"
import { cn } from "@/lib/utils"
import { castVoteAction } from "./applications-actions"

interface Props {
  circle: Circle
  applications: CircleApplication[]
  canVote: boolean
  locale: Locale
  t: Dictionary["circle"]
}

export function ApplicationsSection({
  circle,
  applications,
  canVote,
  locale,
  t,
}: Props) {
  const [apps, setApps] = useState(applications)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleVote = (appId: string, decision: VoteDecision) => {
    setErrorMsg(null)
    setPendingId(appId)
    startTransition(async () => {
      const res = await castVoteAction(circle.id, appId, decision, locale)
      if (res.ok) {
        setApps((prev) =>
          prev.map((a) =>
            a.id === appId
              ? {
                  ...a,
                  status: decision === "ACCEPT" ? "APPROVED" : "REJECTED",
                  votes: {
                    accept: a.votes.accept + (decision === "ACCEPT" ? 1 : 0),
                    reject: a.votes.reject + (decision === "REJECT" ? 1 : 0),
                  },
                }
              : a,
          ),
        )
      } else {
        setErrorMsg(res.error ?? "Error al votar")
      }
      setPendingId(null)
    })
  }

  if (apps.length === 0) {
    return (
      <div className="rounded-[32px] border border-brand-line bg-brand-white p-8 text-center sm:p-12">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-brand-canvas text-brand-slate">
          <UserPlus className="size-6 text-brand-violet" />
        </div>
        <h3 className="mt-4 text-base font-bold text-brand-navy">
          {locale === "es" ? "Sin solicitudes" : "No applications"}
        </h3>
        <p className="mt-1 text-sm text-brand-slate">
          {t.noApplications}
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-[32px] border border-brand-line bg-brand-white p-6 shadow-2xs sm:p-8">
      {errorMsg && (
        <div className="mb-4 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs font-medium text-destructive">
          {errorMsg}
        </div>
      )}

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {apps.map((app) => {
          const isActing = isPending && pendingId === app.id
          const applicantName = app.applicant.name || app.applicant.id

          return (
            <li
              key={app.id}
              className="flex flex-col justify-between rounded-2xl border border-brand-line/70 bg-brand-canvas p-5 transition-colors hover:border-brand-navy/30"
            >
              <div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <MemberAvatar name={applicantName} id={app.applicant.id} size="md" />
                    <div className="min-w-0">
                      <Link
                        href={`/${locale}/members/${app.applicant.id}`}
                        className="truncate block text-sm font-semibold text-brand-navy hover:underline"
                      >
                        {applicantName}
                      </Link>
                      <p className="text-xs text-brand-slate">
                        {app.applicant.ics !== null ? `ICS: ${app.applicant.ics} pts` : "Sin historial previo"}
                      </p>
                    </div>
                  </div>

                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold shrink-0",
                      app.status === "APPROVED" && "bg-brand-mint/20 text-brand-navy",
                      app.status === "PENDING" && "bg-brand-violet/10 text-brand-violet",
                      app.status === "REJECTED" && "bg-brand-line text-brand-slate",
                      app.status === "WITHDRAWN" && "bg-brand-line text-brand-slate opacity-70",
                    )}
                  >
                    {app.status === "PENDING" && <Clock className="size-3" />}
                    <span>{t.applicationStatus[app.status]}</span>
                  </span>
                </div>

                {/* Votes Summary */}
                <div className="mt-4 flex items-center gap-3 text-xs text-brand-slate">
                  <span className="inline-flex items-center gap-1">
                    <ShieldCheck className="size-3.5 text-brand-violet" />
                    <span>Votos: {app.votes.accept} a favor, {app.votes.reject} en contra</span>
                  </span>
                </div>
              </div>

              {canVote && app.status === "PENDING" && (
                <div className="mt-5 flex items-center justify-end gap-2 border-t border-brand-line/60 pt-4">
                  <button
                    type="button"
                    disabled={isActing}
                    onClick={() => handleVote(app.id, "REJECT")}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-brand-line bg-brand-white px-3 text-xs font-semibold text-brand-slate hover:bg-brand-canvas hover:text-brand-navy active:scale-95 disabled:opacity-50 transition-all"
                  >
                    <X className="size-3.5" />
                    <span>{t.voteReject}</span>
                  </button>
                  <button
                    type="button"
                    disabled={isActing}
                    onClick={() => handleVote(app.id, "ACCEPT")}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full bg-brand-navy px-3 text-xs font-semibold text-brand-white hover:bg-brand-navy/90 active:scale-95 disabled:opacity-50 transition-all shadow-2xs"
                  >
                    <Check className="size-3.5" />
                    <span>{t.voteAccept}</span>
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
