import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  CircleCheck,
  CircleDashed,
  Coins,
  Lock,
  MapPin,
  Receipt,
  ShieldCheck,
  Undo2,
  Users,
  Wallet,
} from "lucide-react"
import { CircleRing } from "@/components/circle-ring"
import { MemberAvatar } from "@/components/member-avatar"
import { RoundStatusBadge } from "@/components/round-status"
import { Stars, TrustDial, initials } from "@/components/trust"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ApplicationsSection } from "@/components/applications-section"
import { CircleInvitesPanel } from "@/components/invites/circle-invites-panel"
import { RoundReminderBanner } from "@/components/round-reminder-banner"
import { ServiceUnavailable } from "@/components/service-unavailable"
import { ShareDialog } from "@/components/share-dialog"
import { fill } from "@/i18n/config"
import { getDictionary } from "@/i18n/get-dictionary"
import { isBackendUnavailable } from "@/lib/api/backend"
import { getCircleApplications, getCircleView } from "@/lib/data"
import { roundReminderStatus } from "@/lib/domain/reminders"
import { createClient } from "@/lib/supabase/server"
import { localizedInviteUrl } from "@/lib/flows/circle-invite"
import { siteUrl } from "@/lib/site"
import { amount, formatAmount, percent } from "@/lib/domain/money"
import {
  collectedFor,
  currentRound,
  evaluateCoverage,
  feeFor,
  payoutFor,
  poolBalance,
  potFor,
  seatFor,
  verifiedCount,
} from "@/lib/domain/rounds"
import { trustFor } from "@/lib/domain/trust"
import type { ContributionStatus, RoundState, RoundStatus } from "@/lib/domain/types"
import { cn } from "@/lib/utils"
import { firstName, formatBps, formatDate, ringSeats } from "@/lib/view"

export async function generateMetadata({ params }: PageProps<"/[lang]/circles/[id]">): Promise<Metadata> {
  const view = await getCircleView((await params).id).catch(() => undefined)
  return { title: view?.circle.name ?? "OpenCircle" }
}

const PATH: RoundState[] = ["COLLECTING", "FUNDED", "RISK_CHECK", "PAYING_OUT", "PAID_OUT"]
const ENGINE_STATES: RoundStatus[] = ["FUNDED", "RISK_CHECK", "BLOCKED", "PAYING_OUT", "PAID_OUT"]

const contributionIcon: Record<ContributionStatus, typeof CircleCheck> = {
  VERIFIED: CircleCheck,
  PENDING: CircleDashed,
  MISSING: Lock,
  REFUNDED: Undo2,
}

export default async function CirclePage({ params, searchParams }: PageProps<"/[lang]/circles/[id]">) {
  const { id } = await params
  // A private circle's link carries its invite code; keep it for the join page too.
  const { invite: inviteParam, applied } = await searchParams
  const invite = typeof inviteParam === "string" ? inviteParam : undefined
  const { locale, t } = await getDictionary()
  let view
  try {
    view = await getCircleView(id, invite)
  } catch (err) {
    if (isBackendUnavailable(err)) {
      return (
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
          <ServiceUnavailable t={t.common} retryHref={`/${locale}/circles/${id}`} />
        </div>
      )
    }
    throw err
  }
  if (!view) notFound()
  const { circle, members, reviews: circleReviews, access } = view
  // Members see the applicants and are reminded about their own contribution.
  const [applications, claims] = access.isMember
    ? await Promise.all([getCircleApplications(id), (await createClient()).auth.getClaims()])
    : [null, null]
  const viewerId = claims?.data?.claims.sub

  const byId = new Map(members.map((m) => [m.id, m]))
  const nameOf = (memberId: string) => byId.get(memberId)?.name ?? memberId
  const money = (v: bigint) => formatAmount(amount(v, circle.contribution), locale)
  const round = currentRound(circle)
  const pot = potFor(circle)
  const balance = poolBalance(circle)
  const seats = [...circle.seats].sort((a, b) => a.payoutRound - b.payoutRound)
  const beneficiarySeat = round && round.beneficiaryId ? seatFor(circle, round.beneficiaryId) : undefined
  const coverage = beneficiarySeat ? evaluateCoverage(circle, beneficiarySeat) : undefined
  const beneficiaryName = round && round.beneficiaryId ? firstName(nameOf(round.beneficiaryId)) : "—"
  const pathIndex = round ? PATH.indexOf(round.status === "BLOCKED" ? "RISK_CHECK" : (round.status as RoundState)) : -1
  const openSeats = circle.size - circle.seats.length
  const ownContribution = round && viewerId ? round.contributions.find((c) => c.memberId === viewerId) : undefined
  const reminder = round ? roundReminderStatus(round, ownContribution) : null
  const pendingApplications = applications?.filter((a) => a.status === "PENDING").length ?? 0
  // Without an invite link, a public circle takes applications instead of direct joins.
  const seatCta = access.isMember ? null : access.visibility === "PUBLIC" && !invite ? t.circle.applyCta : t.circle.joinCta
  // Managers share the standing invite link (it carries the code); a public circle is shared by its page.
  const shareUrl = access.inviteUrl
    ? localizedInviteUrl(access.inviteUrl, locale)
    : access.visibility === "PUBLIC"
      ? new URL(`/${locale}/circles/${circle.id}`, siteUrl).toString()
      : null

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      {/* Back button */}
      <Link
        href={`/${locale}/circles`}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-slate transition-colors hover:text-brand-navy"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        <span>{t.circles.title}</span>
      </Link>

      {/* Hero Header Bento Card with Orbital Constellation SVG */}
      <header className="relative isolate mt-4 overflow-hidden rounded-[32px] sm:rounded-[40px] border border-brand-line bg-brand-white p-6 shadow-[0_24px_48px_-28px_color-mix(in_srgb,var(--color-brand-navy)_22%,transparent)] sm:p-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-45 select-none"
        >
          <svg viewBox="0 0 1200 360" fill="none" className="h-full w-full">
            <circle cx="1040" cy="120" r="190" stroke="var(--color-brand-line)" strokeWidth="1.5" strokeDasharray="5 7" />
            <circle cx="1040" cy="120" r="295" stroke="color-mix(in srgb, var(--color-brand-violet) 25%, transparent)" strokeWidth="1" />
            <path d="M 520 310 Q 820 40 1180 200" stroke="color-mix(in srgb, var(--color-brand-mint) 65%, transparent)" strokeWidth="2" strokeDasharray="4 6" />
          </svg>
        </div>

        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {circle.city && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-mist px-3 py-1 text-xs font-semibold text-brand-navy">
                  <MapPin className="size-3 text-brand-violet-ink" aria-hidden="true" />
                  <span>{circle.city}</span>
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-mist px-3 py-1 text-xs font-semibold text-brand-navy">
                <Calendar className="size-3 text-brand-navy/70" aria-hidden="true" />
                <span>{fill(t.circles.perRoundDuration, { days: circle.roundLengthDays })}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-mist px-3 py-1 text-xs font-semibold text-brand-navy">
                <Users className="size-3 text-brand-navy/70" aria-hidden="true" />
                <span>{fill(t.circles.members, { count: circle.size })}</span>
              </span>
              {access.visibility === "PRIVATE" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-violet/20 bg-brand-violet/10 px-3 py-1 text-xs font-semibold text-brand-violet-ink">
                  <Lock className="size-3" aria-hidden="true" />
                  <span>{t.circles.inviteBadge}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-mint px-3 py-1 text-xs font-semibold text-brand-navy">
                  <span>{t.circles.publicBadge}</span>
                </span>
              )}
            </div>

            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-brand-navy sm:text-5xl">
              {circle.name}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-brand-slate">
              <Wallet className="size-3.5 shrink-0 text-brand-violet-ink" />
              <span className="font-medium text-brand-navy">{t.circle.poolWallet}:</span>
              <code className="rounded-full bg-brand-mist px-3 py-1 font-mono text-[11px] font-medium text-brand-navy break-all">
                {circle.poolWalletAddress}
              </code>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-3">
            {shareUrl && <ShareDialog url={shareUrl} circleName={circle.name} t={t.share} />}
            {circle.status === "OPEN" ? (
              seatCta && (
                <Link
                  href={`/${locale}/circles/${circle.id}/join${invite ? `?invite=${encodeURIComponent(invite)}` : ""}`}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-brand-violet px-6 text-sm font-semibold text-brand-white shadow-[0_6px_20px_-8px_var(--color-brand-violet)] transition-[transform,background-color] hover:-translate-y-0.5 hover:bg-brand-violet-ink focus-visible:ring-4 focus-visible:ring-brand-violet/30 active:translate-y-0"
                >
                  {seatCta}
                </Link>
              )
            ) : (
              round && <RoundStatusBadge status={round.status} label={t.circle.states[round.status]} className="text-sm px-3.5 py-1.5" />
            )}
          </div>
        </div>

        {/* 3 Metric Cards: Mist wells + Deep Navy Pot Authority Card */}
        <div className="mt-8 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
          <div className="rounded-2xl bg-brand-mist p-4 sm:p-5">
            <p className="flex items-center gap-1.5 text-xs font-medium text-brand-navy/70">
              <Users className="size-3.5 text-brand-navy" />
              <span>{t.circles.perRound}</span>
            </p>
            <p className="mt-1.5 text-2xl font-semibold tracking-[-0.02em] text-brand-navy tabular-nums">
              {formatAmount(circle.contribution, locale)}
            </p>
          </div>

          <div className="rounded-2xl bg-brand-mist p-4 sm:p-5">
            <p className="flex items-center gap-1.5 text-xs font-medium text-brand-navy/70">
              <ShieldCheck className="size-3.5 text-brand-violet-ink" />
              <span>{t.circle.poolBalance}</span>
            </p>
            <p className="mt-1.5 text-2xl font-semibold tracking-[-0.02em] text-brand-navy tabular-nums">
              {money(balance.total)}
            </p>
          </div>

          <div className="relative isolate overflow-hidden rounded-2xl bg-brand-navy p-4 text-brand-white sm:p-5">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-12 -right-12 -z-10 size-36 rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--color-brand-violet)_45%,transparent),transparent)]"
            />
            <p className="flex items-center gap-1.5 text-xs font-medium text-brand-on-navy">
              <Coins className="size-3.5 text-brand-mint" />
              <span>{t.circle.potLabel}</span>
            </p>
            <p className="mt-1.5 text-2xl font-semibold tracking-[-0.02em] text-brand-mint tabular-nums">
              {money(pot)}
            </p>
          </div>
        </div>
      </header>

      {reminder && round && (
        <RoundReminderBanner status={reminder} deadline={round.deadline} amount={formatAmount(circle.contribution, locale)} locale={locale} t={t.circle.reminders} />
      )}

      {applied === "1" && !access.isMember && (
        <p role="status" className="oc-fade-in mt-6 rounded-2xl bg-brand-mint/40 p-4 text-sm font-medium text-brand-navy">
          {t.circle.applicationSent}
        </p>
      )}

      {access.canInvite && (
        <div className="mt-8">
          <Suspense fallback={<p className="text-sm text-brand-slate">{t.common.loading}</p>}>
            <CircleInvitesPanel
              locale={locale}
              circleId={circle.id}
              circleName={circle.name}
              open={circle.status === "OPEN"}
              isCreator={access.isCreator}
              visibility={access.visibility}
              t={t}
            />
          </Suspense>
        </div>
      )}

      {/* Main Interactive Round Arena */}
      {circle.status === "OPEN" || !round ? (
        <section className="mt-8 grid items-center gap-8 rounded-[32px] border border-brand-line bg-brand-white p-6 shadow-2xs md:grid-cols-2 sm:p-10">
          <CircleRing
            className="mx-auto max-w-md"
            seats={seats.map((s) => ({
              id: s.memberId,
              initials: initials(nameOf(s.memberId)),
              label: nameOf(s.memberId),
              state: "verified",
              beneficiary: false,
            }))}
            progress={percent(BigInt(circle.seats.length), BigInt(circle.size))}
            amount={money(pot)}
            caption={t.circle.potLabel}
            title={circle.name}
          />
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-mint px-3 py-1 text-xs font-semibold text-brand-navy">
              <span className="size-1.5 rounded-full bg-brand-navy" />
              <span>{t.circles.status.OPEN}</span>
            </div>
            <h2 className="mt-3 font-heading text-2xl font-bold text-brand-navy">
              {fill(t.circle.openSeats, { count: openSeats, size: circle.size })}
            </h2>
            <p className="mt-2 text-sm text-brand-slate">
              {fill(t.circles.notStarted, { size: circle.size })}
            </p>
            <Breakdown t={t} pot={money(pot)} fee={money(feeFor(circle))} payout={money(payoutFor(circle))} rate={formatBps(circle.feeBps, locale)} />
          </div>
        </section>
      ) : (
        <section className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Left Column: Ring Dial & Pool Vault */}
          <div className="space-y-6 lg:col-span-5">
            <div className="relative isolate overflow-hidden rounded-[32px] sm:rounded-[36px] border border-brand-line bg-brand-white p-6 text-center shadow-[0_18px_40px_-28px_color-mix(in_srgb,var(--color-brand-navy)_25%,transparent)]">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -inset-6 -z-10 bg-[radial-gradient(55%_55%_at_50%_40%,color-mix(in_srgb,var(--color-brand-violet)_12%,transparent),transparent_70%),radial-gradient(45%_45%_at_30%_75%,color-mix(in_srgb,var(--color-brand-mint)_40%,transparent),transparent_70%)] blur-xl"
              />
              <CircleRing
                className="mx-auto max-w-md"
                seats={ringSeats(circle, round, byId)}
                progress={percent(collectedFor(circle, round), pot)}
                amount={money(collectedFor(circle, round))}
                caption={`/ ${money(pot)}`}
                title={fill(t.circle.collected, { verified: verifiedCount(round), size: circle.size })}
              />
              <ul className="mt-6 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs font-medium text-brand-slate">
                <li className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="size-2.5 rounded-full bg-brand-violet" />
                  <span>{t.circle.legend.verified}</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="size-2.5 rounded-full border border-dashed border-brand-slate" />
                  <span>{t.circle.legend.pending}</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="size-2.5 rounded-full ring-2 ring-brand-navy ring-offset-2 ring-offset-brand-canvas" />
                  <span>{t.circle.legend.beneficiary}</span>
                </li>
              </ul>
            </div>

            {/* Pool Vault Card */}
            <div className="relative isolate overflow-hidden rounded-[32px] sm:rounded-[36px] border border-brand-navy bg-brand-navy p-6 text-brand-white shadow-2xs sm:p-7">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-16 -right-16 -z-10 size-48 rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--color-brand-violet)_40%,transparent),transparent)]"
              />
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-brand-on-navy">{t.circle.poolBalance}</p>
                <ShieldCheck className="size-4 text-brand-mint" />
              </div>
              <p className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-brand-mint tabular-nums">{money(balance.total)}</p>
              <div className="mt-4 pt-4 border-t border-brand-white/10 text-xs text-brand-on-navy">
                <p>{fill(t.circle.balanceParts, { round: money(balance.round), collateral: money(balance.collateral), fees: money(balance.fees) })}</p>
              </div>
            </div>
          </div>

          {/* Right Column: Timeline, Contributions & Safe Round Engine */}
          <div className="space-y-6 lg:col-span-7">
            {/* Round Timeline Card */}
            <div className="rounded-[32px] sm:rounded-[36px] border border-brand-line bg-brand-white p-6 shadow-2xs sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-bold tracking-tight text-brand-navy">
                  {fill(t.circle.currentRound, { round: round.number })}
                </h2>
                <div className="text-xs text-brand-slate">
                  {t.circle.beneficiary}:{" "}
                  {round.beneficiaryId ? (
                    <Link href={`/${locale}/members/${round.beneficiaryId}`} className="font-semibold text-brand-navy hover:underline">
                      {nameOf(round.beneficiaryId)}
                    </Link>
                  ) : (
                    <span className="font-semibold text-brand-navy">—</span>
                  )}
                </div>
              </div>

              {/* Connected Visual Timeline */}
              <div className="mt-6">
                <ol className="grid grid-cols-5 gap-2" aria-label={t.circle.stateTitle}>
                  {PATH.map((state, i) => {
                    const done = i < pathIndex || round.status === "PAID_OUT"
                    const current = i === pathIndex && round.status !== "PAID_OUT"
                    const held = current && round.status === "BLOCKED"
                    return (
                      <li key={state} aria-current={current ? "step" : undefined} className="flex flex-col gap-2">
                        <div
                          className={cn(
                            "h-2 w-full rounded-full transition-colors",
                            done ? "bg-brand-violet" : current ? "bg-brand-navy ring-2 ring-brand-navy/20" : "bg-brand-line",
                          )}
                        />
                        <span className={cn("text-[11px] leading-tight", current ? "font-bold text-brand-navy" : "text-brand-slate")}>
                          {held ? t.circle.states.BLOCKED : t.circle.states[state]}
                        </span>
                      </li>
                    )
                  })}
                </ol>
                <p className="mt-4 rounded-2xl bg-brand-mist p-3.5 text-xs leading-relaxed text-brand-navy">
                  {t.circle.stateHelp[round.status]}
                </p>
              </div>
            </div>

            {/* Contributions Ledger Bento */}
            <div className="rounded-[32px] sm:rounded-[36px] border border-brand-line bg-brand-white p-6 shadow-2xs sm:p-7">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-brand-navy">{t.circle.contributionsTitle}</h2>
                  <p className="text-xs text-brand-slate">{fill(t.circle.collected, { verified: verifiedCount(round), size: circle.size })}</p>
                </div>
                <div className="inline-flex items-center gap-1 rounded-full bg-brand-mist px-3 py-1 text-xs font-semibold text-brand-violet-ink">
                  <CheckCircle2 className="size-3.5" />
                  <span>Interledger STREAM</span>
                </div>
              </div>

              {/* Cards Grid for Participants */}
              <div className="mt-4 grid grid-cols-1 gap-2.5">
                {round.contributions.map((c) => {
                  const Icon = contributionIcon[c.status]
                  const personName = nameOf(c.memberId)
                  return (
                    <div
                      key={c.memberId}
                      className="flex items-center justify-between rounded-2xl border border-brand-line/80 bg-brand-canvas px-4 py-3 transition-colors hover:border-brand-navy/20"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <MemberAvatar name={personName} id={c.memberId} size="sm" />
                        <Link href={`/${locale}/members/${c.memberId}`} className="truncate text-sm font-semibold text-brand-navy hover:underline">
                          {personName}
                        </Link>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-mono text-sm font-bold text-brand-navy tabular-nums">
                          {formatAmount(circle.contribution, locale)}
                        </span>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                            c.status === "VERIFIED"
                              ? "bg-brand-mint text-brand-navy"
                              : "bg-brand-white text-brand-slate border border-brand-line",
                          )}
                        >
                          <Icon className="size-3.5" aria-hidden="true" />
                          <span>{t.circle.contribution[c.status]}</span>
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Safe Round Engine Card */}
            <div
              className={cn(
                "rounded-[32px] border p-6 shadow-2xs sm:p-7 transition-colors",
                coverage && !coverage.eligible && ENGINE_STATES.includes(round.status)
                  ? "border-brand-navy bg-brand-white"
                  : "border-brand-line bg-brand-white",
              )}
            >
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-full bg-brand-violet/10 text-brand-violet-ink">
                  <ShieldCheck className="size-4.5" aria-hidden="true" />
                </span>
                <h2 className="text-lg font-bold tracking-tight text-brand-navy">
                  {t.circle.engineTitle}
                </h2>
              </div>

              {coverage && ENGINE_STATES.includes(round.status) ? (
                <>
                  <p className="mt-2 text-xs leading-relaxed text-brand-slate">
                    {fill(t.circle.engineLead, { name: beneficiaryName })}
                  </p>
                  <dl className="mt-4 space-y-2 rounded-2xl bg-brand-canvas p-4 border border-brand-line/60 text-xs">
                    <Row label={t.circle.owes} value={money(coverage.owes)} />
                    <Row label={t.circle.collateral} value={`− ${money(coverage.collateral)}`} />
                    <Row label={fill(t.circle.grant, { weight: formatBps(circle.grantWeightBps, locale) })} value={`− ${money(coverage.grantCoverage)}`} />
                    <Row label={t.circle.uncovered} value={money(coverage.uncovered)} strong />
                    <Row label={t.circle.threshold} value={money(coverage.threshold)} />
                  </dl>
                  <p
                    className={cn(
                      "mt-4 flex items-start gap-2 rounded-2xl p-3.5 text-xs font-semibold",
                      coverage.eligible ? "bg-brand-mint text-brand-navy" : "bg-brand-navy text-brand-white",
                    )}
                  >
                    {coverage.eligible ? <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
                    <span>{coverage.eligible ? t.circle.eligible : fill(t.circle.blocked, { name: beneficiaryName })}</span>
                  </p>
                </>
              ) : (
                <p className="mt-2 text-xs text-brand-slate">{t.circle.noEngine}</p>
              )}
            </div>

            {/* Pot payout receipt */}
            {(round.status === "PAYING_OUT" || round.status === "PAID_OUT" || coverage?.eligible) && (
              <div className="animate-in fade-in rounded-[32px] border border-brand-mint/60 bg-brand-mint/10 p-6 shadow-2xs sm:p-7">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-full bg-brand-mint text-brand-navy">
                      <Receipt className="size-4.5" aria-hidden="true" />
                    </span>
                    <div>
                      <h3 className="text-base font-bold text-brand-navy">
                        {t.circle.receiptTitle}
                      </h3>
                      <p className="text-xs text-brand-slate">
                        {t.circle.receiptSubtitle}
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-mint px-2.5 py-0.5 text-xs font-semibold text-brand-navy">
                    <CheckCircle2 className="size-3 text-brand-navy" aria-hidden="true" />
                    <span>{t.circle.legend.verified}</span>
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 rounded-2xl border border-brand-line/60 bg-brand-white p-4 sm:grid-cols-3">
                  <div>
                    <span className="block text-[11px] font-medium text-brand-slate">{t.circle.collectedAmount}</span>
                    <span className="font-mono text-base font-bold text-brand-navy tabular-nums">{money(pot)}</span>
                  </div>
                  <div>
                    <span className="block text-[11px] font-medium text-brand-slate">{fill(t.circle.fee, { rate: formatBps(circle.feeBps, locale) })}</span>
                    <span className="font-mono text-base font-bold text-brand-slate tabular-nums">− {money(feeFor(circle))}</span>
                  </div>
                  <div>
                    <span className="block text-[11px] font-medium text-brand-slate">
                      {t.circle.payout} · {beneficiaryName}
                    </span>
                    <span className="font-mono text-lg font-extrabold text-brand-violet tabular-nums">{money(payoutFor(circle))}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Tabs for Order, Members and Reviews */}
      <Tabs defaultValue="order" className="mt-12">
        <div className="flex justify-center sm:justify-start">
          <TabsList className="max-w-full rounded-full bg-brand-white p-1 border border-brand-line shadow-2xs">
            <TabsTrigger value="order" className="rounded-full px-2.5 py-2 text-xs font-semibold sm:px-5">
              {t.circle.tabs.order}
            </TabsTrigger>
            <TabsTrigger value="members" className="rounded-full px-2.5 py-2 text-xs font-semibold sm:px-5">
              {t.circle.tabs.members}
            </TabsTrigger>
            <TabsTrigger value="reviews" className="rounded-full px-2.5 py-2 text-xs font-semibold sm:px-5">
              {t.circle.tabs.reviews} ({circleReviews.length})
            </TabsTrigger>
            {applications !== null && (
              <TabsTrigger value="applications" className="rounded-full px-2.5 py-2 text-xs font-semibold sm:px-5">
                {t.circle.tabs.applications}
                {pendingApplications > 0 && <span className="ml-1 rounded-full bg-brand-violet px-1.5 text-[10px] text-brand-white">{pendingApplications}</span>}
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        <TabsContent value="order" className="mt-6">
          <div className="rounded-[32px] border border-brand-line bg-brand-white p-6 shadow-2xs sm:p-8">
            <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {seats.map((seat) => {
                const r = circle.rounds.find((x) => x.number === seat.payoutRound)
                return (
                  <li
                    key={seat.memberId}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-brand-line/70 bg-brand-canvas p-4"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex size-7 items-center justify-center rounded-full bg-brand-violet text-xs font-bold text-brand-white">
                        {seat.payoutRound}
                      </span>
                      <Link href={`/${locale}/members/${seat.memberId}`} className="text-sm font-semibold text-brand-navy hover:underline">
                        {nameOf(seat.memberId)}
                      </Link>
                    </div>
                    {r && <RoundStatusBadge status={r.status} label={t.circle.states[r.status]} />}
                  </li>
                )
              })}
            </ol>
          </div>
        </TabsContent>

        <TabsContent value="members" className="mt-6">
          <div className="rounded-[32px] border border-brand-line bg-brand-white p-6 shadow-2xs sm:p-8">
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {seats.map((seat) => {
                const m = byId.get(seat.memberId)
                if (!m) return null
                const trust = trustFor(m)
                return (
                  <li key={m.id} className="flex items-center gap-4 rounded-2xl border border-brand-line/70 bg-brand-canvas p-4">
                    <TrustDial trust={trust} label={t.member.trustScore} />
                    <div className="min-w-0">
                      <Link href={`/${locale}/members/${m.id}`} className="text-sm font-semibold text-brand-navy hover:underline">
                        {m.name}
                      </Link>
                      <p className="mt-0.5 text-xs text-brand-slate">
                        {t.member.levels[trust.level]} · {t.circle.grantModes[seat.grant ?? "NONE"]}
                        {BigInt(seat.collateralValue) > 0n ? `, ${t.circle.collateral.toLowerCase()} ${money(BigInt(seat.collateralValue))}` : ""}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        </TabsContent>

        <TabsContent value="reviews" className="mt-6">
          <div className="rounded-[32px] border border-brand-line bg-brand-white p-6 shadow-2xs sm:p-8">
            {circleReviews.length === 0 ? (
              <p className="text-center text-sm text-brand-slate py-8">{t.circle.noReviews}</p>
            ) : (
              <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {circleReviews.map((r) => (
                  <li key={r.id} className="rounded-2xl border border-brand-line/70 bg-brand-canvas p-5">
                    <div className="flex items-center justify-between gap-3">
                      <Link href={`/${locale}/members/${r.subjectId}`} className="text-sm font-semibold text-brand-navy hover:underline">
                        {nameOf(r.subjectId)}
                      </Link>
                      <Stars rating={r.rating} label={fill(t.member.rating, { rating: r.rating })} />
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-brand-navy/90 italic">“{r.comment}”</p>
                    <p className="mt-3 text-xs text-brand-slate">
                      {r.authorName} · {formatDate(r.date, locale)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        {applications !== null && (
          <TabsContent value="applications" className="mt-6">
            <ApplicationsSection
              locale={locale}
              circleId={circle.id}
              applications={applications}
              canVote={access.canVote}
              approvalMode={circle.approvalMode ?? "DELEGATES"}
              isCreator={access.isCreator}
              creatorUserId={access.isCreator ? viewerId : undefined}
              seats={circle.seats}
              t={t.circle}
              tErr={t.circleErrors}
            />
          </TabsContent>
        )}
      </Tabs>

      {/* Mobile Sticky Action Bar (positioned above the floating AppMobileDock and its elevated center button) */}
      {circle.status === "OPEN" && seatCta && (
        <div className="fixed inset-x-3 bottom-24 z-30 mx-auto max-w-md rounded-3xl border border-brand-line bg-brand-white/95 px-4 py-3 backdrop-blur-md shadow-[0_10px_28px_-8px_color-mix(in_srgb,var(--color-brand-navy)_25%,transparent)] md:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-brand-navy">{circle.name}</p>
              <p className="text-xs font-medium text-brand-slate">
                {t.circle.stickyContribution}:{" "}
                <span className="font-mono font-bold text-brand-navy tabular-nums">
                  {formatAmount(circle.contribution, locale)}
                </span>
              </p>
            </div>
            <Link
              href={`/${locale}/circles/${circle.id}/join${invite ? `?invite=${encodeURIComponent(invite)}` : ""}`}
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-brand-violet px-5 text-xs font-semibold text-brand-white shadow-[0_6px_20px_-8px_var(--color-brand-violet)] transition-transform active:scale-95"
            >
              {seatCta}
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

type Dict = Awaited<ReturnType<typeof getDictionary>>["t"]

function Breakdown({ t, pot, fee, payout, rate }: { t: Dict; pot: string; fee: string; payout: string; rate: string }) {
  return (
    <div className="mt-6 rounded-2xl bg-brand-canvas p-4 border border-brand-line/60">
      <h3 className="text-xs font-bold uppercase tracking-wider text-brand-slate">{t.circle.breakdownTitle}</h3>
      <dl className="mt-3 space-y-2 text-xs">
        <Row label={t.circle.potLabel} value={pot} />
        <Row label={fill(t.circle.fee, { rate })} value={`− ${fee}`} />
        <Row label={t.circle.payout} value={payout} strong />
      </dl>
    </div>
  )
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4", strong && "border-t border-brand-line pt-2 font-bold text-brand-navy")}>
      <dt className={cn(!strong && "text-brand-slate font-medium")}>{label}</dt>
      <dd className="tabular-nums font-mono">{value}</dd>
    </div>
  )
}
