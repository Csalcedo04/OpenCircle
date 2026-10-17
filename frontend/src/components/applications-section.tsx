"use client"

import { useActionState, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Clock, LoaderCircle, Shield, UserPlus, Wallet, X } from "lucide-react"
import { MemberAvatar } from "@/components/member-avatar"
import { Button } from "@/components/ui/button"
import { fill, type Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import { castVoteAction, type VoteState } from "@/lib/actions/circle-applications"
import { ApproversModal } from "@/components/approvers-modal"
import type { ApplicationDto, ApplicationStatus } from "@/lib/api/backend"
import type { Seat } from "@/lib/domain/types"
import { cn } from "@/lib/utils"
import { formatDate } from "@/lib/view"

interface Props {
  locale: Locale
  circleId: string
  applications: ApplicationDto[]
  /** DELEGATES: creator and approvers; MAJORITY: every member (from `access.canVote`). */
  canVote: boolean
  approvalMode: "DELEGATES" | "MAJORITY"
  isCreator?: boolean | undefined
  creatorUserId?: string | undefined
  seats?: Seat[] | undefined
  t: Dictionary["circle"]
  tErr: Dictionary["circleErrors"]
}

const statusStyle: Record<ApplicationStatus, { icon: typeof Clock; className: string }> = {
  PENDING: { icon: Clock, className: "bg-brand-mint text-brand-navy" },
  ACCEPTED: { icon: Check, className: "bg-brand-navy text-brand-white" },
  REJECTED: { icon: X, className: "bg-brand-mist text-brand-navy" },
  WITHDRAWN: { icon: X, className: "bg-brand-mist text-brand-navy" },
}

function StatusChip({ status, t }: { status: ApplicationStatus; t: Dictionary["circle"] }) {
  const { icon: Icon, className } = statusStyle[status]
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold", className)}>
      <Icon className="size-3" aria-hidden="true" />
      {t.applicationStatus[status]}
    </span>
  )
}

/** One decision button; what the API answers replaces the card. */
function VoteButton({
  locale,
  circleId,
  application,
  decision,
  onResult,
  t,
  tErr,
}: {
  locale: Locale
  circleId: string
  application: ApplicationDto
  decision: "ACCEPT" | "REJECT"
  onResult: (state: VoteState) => void
  t: Dictionary["circle"]
  tErr: Dictionary["circleErrors"]
}) {
  const [state, action, pending] = useActionState<VoteState, FormData>(
    async () => {
      const result = await castVoteAction(locale, circleId, application.id, decision)
      onResult(result)
      return result
    },
    { error: null, application: null },
  )
  const accept = decision === "ACCEPT"
  return (
    <form action={action}>
      <Button
        type="submit"
        variant={accept ? "default" : "outline"}
        disabled={pending}
        className={cn(
          "h-9 rounded-full px-3.5 text-xs font-semibold",
          accept ? "bg-brand-navy text-brand-white hover:bg-brand-navy/90" : "border-brand-line bg-brand-white text-brand-navy hover:bg-brand-canvas",
        )}
      >
        {pending ? <LoaderCircle className="motion-safe:animate-spin" aria-hidden="true" /> : accept ? <Check aria-hidden="true" /> : <X aria-hidden="true" />}
        {accept ? t.voteAccept : t.voteReject}
      </Button>
      {state.error && (
        <span role="alert" className="ml-2 text-xs font-medium text-brand-violet-ink">
          {tErr[state.error]}
        </span>
      )}
    </form>
  )
}

export function ApplicationsSection({
  locale,
  circleId,
  applications,
  canVote,
  approvalMode,
  isCreator,
  creatorUserId,
  seats,
  t,
  tErr,
}: Props) {
  const router = useRouter()
  // Local copy so a vote's answer shows at once; the page revalidates behind it.
  const [items, setItems] = useState(applications)
  const [received, setReceived] = useState(applications)
  if (received !== applications) {
    // New props after a revalidation: adopt them (React's "adjust state on prop change" pattern).
    setReceived(applications)
    setItems(applications)
  }

  const onResult = (state: VoteState) => {
    if (!state.application) return
    const next = state.application
    setItems((prev) => prev.map((a) => (a.id === next.id ? next : a)))
    // Accepting can fill the circle and auto-reject the rest: re-read everything.
    if (next.status !== "PENDING") router.refresh()
  }

  if (items.length === 0) {
    return (
      <div className="rounded-[32px] border border-brand-line bg-brand-white p-8 text-center sm:p-12">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-brand-canvas">
          <UserPlus className="size-6 text-brand-violet" aria-hidden="true" />
        </span>
        <p className="mt-4 text-sm text-brand-slate">{t.noApplications}</p>
        {isCreator && approvalMode === "DELEGATES" && seats && (
          <div className="mt-5 flex justify-center">
            <ApproversModal locale={locale} circleId={circleId} seats={seats} creatorUserId={creatorUserId} t={t} tErr={tErr} />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-[32px] border border-brand-line bg-brand-white p-6 shadow-2xs sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-brand-slate">
          {approvalMode === "MAJORITY" ? t.applicationsHelpMajority : t.applicationsHelpDelegates}
        </p>
        {isCreator && approvalMode === "DELEGATES" && seats && (
          <ApproversModal locale={locale} circleId={circleId} seats={seats} creatorUserId={creatorUserId} t={t} tErr={tErr} />
        )}
      </div>
      <ul className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {items.map((app) => {
          const name = app.applicant.fullName ?? app.applicant.walletAddress
          return (
            <li key={app.id} className="flex flex-col justify-between rounded-2xl border border-brand-line/70 bg-brand-canvas p-5">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <MemberAvatar name={name} id={app.id} size="md" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-brand-navy">{name}</p>
                      <p className="text-xs text-brand-slate">
                        {app.applicant.ics === null ? t.noIcs : fill(t.icsLabel, { score: Math.round(app.applicant.ics) })}
                      </p>
                    </div>
                  </div>
                  <StatusChip status={app.status} t={t} />
                </div>
                <dl className="mt-4 space-y-1 text-xs text-brand-slate">
                  <div className="flex items-center gap-1.5">
                    <Wallet className="size-3.5 shrink-0 text-brand-violet" aria-hidden="true" />
                    <dd className="truncate font-mono text-[11px] text-brand-navy">{app.applicant.walletAddress}</dd>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Shield className="size-3.5 shrink-0 text-brand-violet" aria-hidden="true" />
                    <dd>{fill(t.votes, { accept: app.votes.accept, reject: app.votes.reject })}</dd>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="size-3.5 shrink-0 text-brand-slate" aria-hidden="true" />
                    <dd>{formatDate(app.decidedAt ?? app.createdAt, locale)}</dd>
                  </div>
                </dl>
              </div>
              {canVote && app.status === "PENDING" && (
                <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-brand-line/60 pt-4">
                  <VoteButton locale={locale} circleId={circleId} application={app} decision="REJECT" onResult={onResult} t={t} tErr={tErr} />
                  <VoteButton locale={locale} circleId={circleId} application={app} decision="ACCEPT" onResult={onResult} t={t} tErr={tErr} />
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
