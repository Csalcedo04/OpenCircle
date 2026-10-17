import Link from "next/link"
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowRight,
  Ban,
  CalendarClock,
  ChevronDown,
  CircleCheck,
  CircleDashed,
  CircleX,
  Clock,
  Coins,
  FlaskConical,
  Gift,
  HelpCircle,
  KeyRound,
  Loader2,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react"
import { CreateAccountForm } from "@/app/[lang]/(app)/onboarding/create-account-form"
import { WalletForm } from "@/app/[lang]/(app)/onboarding/wallet-form"
import { CreditPassportModal } from "@/components/credit-passport-modal"
import { fill, type Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import type { Activity, Dashboard, DashboardCircle, Movement, PaymentStatus, Profile } from "@/lib/api/backend"
import type { ProfileErrorKey } from "@/lib/flows/profile-form"
import { flagOf } from "@/lib/countries"
import { amount, formatAmount, percent, toBig } from "@/lib/domain/money"
import {
  circleAction,
  isAuthorized,
  nextPayout,
  reliability,
  roundFunding,
  upcomingPayment,
  type NextAction,
  type NextActionKind,
} from "@/lib/flows/account-dashboard"
import { cn } from "@/lib/utils"
import { formatDate } from "@/lib/view"
import { CopyButton } from "./copy-button"

type T = Dictionary["account"]

// ── Shared pieces ───────────────────────────────────────────────────────────

const card = "rounded-[28px] border border-brand-line bg-brand-white p-5 shadow-2xs sm:p-7"
const chip = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
const primaryLink =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-brand-violet px-5 text-sm font-semibold text-brand-white transition-colors hover:bg-brand-violet-ink focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
const secondaryLink =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full border border-brand-line bg-brand-white px-5 text-sm font-semibold text-brand-navy transition-colors hover:bg-brand-canvas focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"

function SectionLabel({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-brand-slate">
      <Icon className="size-3.5 text-brand-violet-ink" aria-hidden="true" />
      {children}
    </span>
  )
}

const shortDate = (iso: string, locale: Locale) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return new Intl.DateTimeFormat(locale === "es" ? "es-CO" : "en-US", { day: "numeric", month: "short", timeZone: "UTC" }).format(d)
}

const dateTime = (iso: string, locale: Locale) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return (
    new Intl.DateTimeFormat(locale === "es" ? "es-CO" : "en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(
      d,
    ) + " UTC"
  )
}

/** Brand palette only: state reads from the icon and the label, colour just groups it. */
const payStyle: Record<PaymentStatus, { icon: LucideIcon; tone: string; spin?: boolean }> = {
  COMPLETED: { icon: CircleCheck, tone: "bg-brand-mint text-brand-navy" },
  PROCESSING: { icon: Loader2, tone: "bg-brand-violet text-brand-white", spin: true },
  PENDING: { icon: Clock, tone: "border border-brand-slate text-brand-navy" },
  FAILED: { icon: CircleX, tone: "bg-brand-navy text-brand-white" },
  CANCELLED: { icon: Ban, tone: "border border-brand-line text-brand-slate" },
}

export function PaymentBadge({ status, t }: { status: PaymentStatus | null; t: T["payStatus"] }) {
  if (status === null) {
    return (
      <span className={cn(chip, "border border-brand-line text-brand-slate")}>
        <CircleDashed className="size-3.5" aria-hidden="true" />
        {t.NONE}
      </span>
    )
  }
  const { icon: Icon, tone, spin } = payStyle[status]
  return (
    <span className={cn(chip, "whitespace-nowrap", tone)}>
      <Icon className={cn("size-3.5", spin && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
      {t[status]}
    </span>
  )
}

// ── Header ──────────────────────────────────────────────────────────────────

export function AccountHeader({ t, locale }: { t: T; locale: Locale }) {
  return (
    <header className="relative isolate overflow-hidden rounded-[32px] sm:rounded-[40px] border border-brand-line bg-brand-white p-6 sm:p-9 shadow-[0_24px_48px_-28px_color-mix(in_srgb,var(--color-brand-navy)_22%,transparent)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-45 select-none"
      >
        <svg viewBox="0 0 1200 320" fill="none" className="h-full w-full">
          <circle cx="1040" cy="110" r="180" stroke="var(--color-brand-line)" strokeWidth="1.5" strokeDasharray="5 7" />
          <circle cx="1040" cy="110" r="280" stroke="color-mix(in srgb, var(--color-brand-violet) 25%, transparent)" strokeWidth="1" />
          <path d="M 540 280 Q 840 40 1180 190" stroke="color-mix(in srgb, var(--color-brand-mint) 65%, transparent)" strokeWidth="2" strokeDasharray="4 6" />
        </svg>
      </div>

      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <span className={cn(chip, "border border-brand-line bg-brand-canvas text-brand-navy shadow-2xs")}>
            <FlaskConical className="size-3.5 text-brand-violet-ink" aria-hidden="true" />
            {t.demoBadge}
          </span>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-brand-navy sm:text-5xl">{t.title}</h1>
          <p className="mt-2 max-w-xl text-base leading-relaxed text-brand-slate sm:text-lg">{t.lead}</p>
        </div>
        <Link href={`/${locale}/circles`} className={cn(secondaryLink, "self-start sm:self-auto")}>
          {t.viewAllCircles}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </header>
  )
}

export function DemoNotice({ t }: { t: T }) {
  return (
    <p role="note" className="mt-6 flex items-start gap-2.5 rounded-2xl border border-brand-line bg-brand-mist px-4 py-3 text-sm font-medium text-brand-navy">
      <FlaskConical className="mt-0.5 size-4 shrink-0 text-brand-violet-ink" aria-hidden="true" />
      {t.demoNotice}
    </p>
  )
}

// ── Financial overview ──────────────────────────────────────────────────────

function Metric({
  icon: Icon,
  label,
  children,
  hint,
  featured = false,
}: {
  icon: LucideIcon
  label: string
  children: React.ReactNode
  hint: React.ReactNode
  featured?: boolean
}) {
  return (
    <div
      className={cn(
        "relative isolate flex min-w-0 flex-col overflow-hidden rounded-[28px] border p-5 shadow-2xs sm:p-6",
        featured
          ? "border-brand-navy bg-brand-navy text-brand-white"
          : "border-brand-line bg-brand-white text-brand-navy",
      )}
    >
      {featured && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-12 -right-12 -z-10 size-40 rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--color-brand-violet)_40%,transparent),transparent)]"
        />
      )}
      <span
        className={cn(
          "flex items-center gap-2 text-xs font-medium",
          featured ? "text-brand-on-navy" : "text-brand-slate",
        )}
      >
        <span
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-full",
            featured ? "bg-brand-mint text-brand-navy" : "bg-brand-mist text-brand-navy",
          )}
        >
          <Icon className="size-3.5" aria-hidden="true" />
        </span>
        {label}
      </span>
      <div
        className={cn(
          "mt-3 min-w-0 text-xl font-semibold tracking-[-0.02em] tabular-nums break-words sm:text-2xl",
          featured ? "text-brand-mint" : "text-brand-navy",
        )}
      >
        {children}
      </div>
      <p className={cn("mt-1 text-xs", featured ? "text-brand-on-navy" : "text-brand-slate")}>{hint}</p>
    </div>
  )
}

export function FinancialOverview({ data, t, locale }: { data: Dashboard; t: T; locale: Locale }) {
  const o = t.overview
  const payment = upcomingPayment(data)
  const payout = nextPayout(data.circles)
  const completed = data.circles.filter((c) => c.status === "COMPLETED").length

  return (
    <section aria-labelledby="overview-title" className="mt-8">
      <h2 id="overview-title" className="sr-only">
        {o.title}
      </h2>
      <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <Metric icon={Coins} label={o.contributed} hint={data.contributed.length > 0 ? o.contributedHint : o.contributedEmpty}>
          {data.contributed.length === 0 ? (
            data.wallet ? formatAmount(amount(0n, data.wallet), locale) : "—"
          ) : (
            // One line per currency: different assets are never added together.
            <ul>
              {data.contributed.map((a) => (
                <li key={`${a.assetCode}-${a.assetScale}`}>{formatAmount(a, locale)}</li>
              ))}
            </ul>
          )}
        </Metric>
        <Metric
          icon={CalendarClock}
          label={o.upcoming}
          hint={payment?.round ? fill(o.upcomingHint, { date: formatDate(payment.round.deadline, locale) }) : o.upcomingEmpty}
        >
          {payment ? formatAmount(payment.circle.contribution, locale) : "—"}
        </Metric>
        <Metric
          icon={Gift}
          label={o.payout}
          featured
          hint={payout?.round ? fill(o.payoutHint, { round: payout.round.number, date: formatDate(payout.round.deadline, locale) }) : o.payoutEmpty}
        >
          {payout ? formatAmount(payout.circle.expectedPayout, locale) : "—"}
        </Metric>
        <Metric icon={Trophy} label={o.completed} hint={o.completedHint}>
          {completed}
        </Metric>
      </div>
    </section>
  )
}

// ── Next action ─────────────────────────────────────────────────────────────

const actionStyle: Record<NextActionKind, { icon: LucideIcon; tone: string; spin?: boolean }> = {
  OVERDUE: { icon: AlertTriangle, tone: "bg-brand-navy text-brand-white" },
  FAILED: { icon: CircleX, tone: "bg-brand-navy text-brand-white" },
  AUTHORIZATION_REQUIRED: { icon: KeyRound, tone: "bg-brand-violet text-brand-white" },
  DUE_TODAY: { icon: CalendarClock, tone: "bg-brand-violet text-brand-white" },
  SCHEDULED: { icon: Clock, tone: "bg-brand-mint text-brand-navy" },
  PROCESSING: { icon: Loader2, tone: "bg-brand-violet text-brand-white", spin: true },
  UPCOMING: { icon: CalendarClock, tone: "border border-brand-slate text-brand-navy" },
  WAITING_FOR_MEMBERS: { icon: Users, tone: "border border-brand-slate text-brand-navy" },
}

const FAILURE_CODES = ["NO_GRANT", "QUOTE_FAILED", "PAYMENT_REFUSED", "DEADLINE_MISSED"] as const
const failureText = (code: string | null, t: T["next"]["failure"]): string | null =>
  FAILURE_CODES.find((c) => c === code) ? t[code as (typeof FAILURE_CODES)[number]] : null

export function NextActionCard({ action, t, locale }: { action: NextAction | null; t: T; locale: Locale }) {
  const n = t.next
  if (!action) {
    return (
      <section aria-labelledby="next-title" className={cn(card, "flex flex-col justify-between lg:col-span-7")}>
        <div>
          <SectionLabel icon={Sparkles}>
            <span id="next-title">{n.eyebrow}</span>
          </SectionLabel>
          <p className="mt-5 text-2xl font-semibold tracking-[-0.02em] text-brand-navy">{n.emptyTitle}</p>
          <p className="mt-2 text-sm text-brand-slate">{n.emptyBody}</p>
        </div>
        <Link href={`/${locale}/circles`} className={cn(primaryLink, "mt-6 self-start")}>
          {n.explore}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </section>
    )
  }

  const { kind, circle, round } = action
  const { icon: Icon, tone, spin } = actionStyle[kind]
  const circleHref = `/${locale}/circles/${circle.id}`
  const failure = kind === "FAILED" ? failureText(round?.myFailureCode ?? null, n.failure) : null
  const help = fill(n.help[kind], { size: circle.size, taken: circle.seatsTaken })
  // Only actions the backend supports: contributions are charged automatically under the wallet grant,
  // so there is no manual "pay" or "retry"; the user can (re)authorize the wallet or inspect it.
  const needsGrant = kind === "AUTHORIZATION_REQUIRED" || (kind === "FAILED" && round?.myFailureCode === "NO_GRANT")
  const showsGrant = kind === "SCHEDULED" || kind === "DUE_TODAY" || kind === "UPCOMING"

  return (
    <section
      aria-labelledby="next-title"
      className={cn(card, "relative flex flex-col justify-between overflow-hidden ring-1 ring-brand-violet/30 lg:col-span-7")}
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5 bg-brand-violet" />
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionLabel icon={Sparkles}>
            <span id="next-title">{n.eyebrow}</span>
          </SectionLabel>
          <span className={cn(chip, tone)}>
            <Icon className={cn("size-3.5", spin && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
            {n.kinds[kind]}
          </span>
        </div>

        <p className="mt-5 text-sm font-semibold text-brand-slate">{circle.name}</p>
        <p className="mt-1 text-4xl font-semibold tracking-[-0.04em] text-brand-navy tabular-nums sm:text-5xl">
          {formatAmount(circle.contribution, locale)}
        </p>

        {round && (
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm font-medium text-brand-navy">
            <span>{fill(n.roundOf, { round: round.number, size: circle.size })}</span>
            <span aria-hidden="true" className="text-brand-line">
              •
            </span>
            <span>
              {kind === "UPCOMING"
                ? fill(n.opens, { date: formatDate(round.startsAt || round.deadline, locale) })
                : fill(n.due, { date: formatDate(round.deadline, locale) })}
            </span>
          </p>
        )}

        <p className="mt-4 max-w-prose text-sm leading-relaxed text-brand-slate">{help}</p>
        {failure && <p className="mt-2 text-sm font-medium text-brand-navy">{failure}</p>}
        {action.paidPrevious && round && (
          <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-navy">
            <CircleCheck className="size-3.5 text-brand-violet-ink" aria-hidden="true" />
            {fill(n.paidPrevious, { round: round.number - 1 })}
          </p>
        )}
        {circle.onTestClock && (
          <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-brand-slate">
            <FlaskConical className="size-3.5" aria-hidden="true" />
            {t.testClock}
          </p>
        )}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        {needsGrant && (
          <Link href={`/${locale}/onboarding?edit=wallet`} className={primaryLink}>
            <KeyRound className="size-4" aria-hidden="true" />
            {n.authorize}
          </Link>
        )}
        {showsGrant && (
          <Link href="#wallet" className={primaryLink}>
            <ShieldCheck className="size-4" aria-hidden="true" />
            {n.viewAuthorization}
          </Link>
        )}
        <Link href={circleHref} className={secondaryLink}>
          {n.viewCircle}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  )
}

// ── Community trust (ICS) ───────────────────────────────────────────────────

function TrustStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-brand-white/10 py-2.5 text-sm first:border-t-0">
      <dt className="text-brand-on-navy">{label}</dt>
      <dd className="font-semibold text-brand-white tabular-nums">{value}</dd>
    </div>
  )
}

export function CommunityTrustCard({ data, kycApproved, t }: { data: Dashboard; kycApproved: boolean; t: T }) {
  const tr = t.trust
  const { onTime, late } = data.record.payments
  const rate = reliability(data.record)
  const score = data.ics

  return (
    <section aria-labelledby="trust-title" className="flex flex-col rounded-[28px] bg-brand-navy p-5 text-brand-white shadow-sm sm:p-7 lg:col-span-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="trust-title" className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-brand-mint">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          {tr.title}
        </h2>
        <CreditPassportModal data={data} kycApproved={kycApproved} t={tr} authLabels={t.wallet.auth} />
      </div>

      {score === null ? (
        <div className="mt-5">
          <p className="text-2xl font-semibold tracking-[-0.02em] text-brand-mint">{tr.building}</p>
          <p className="mt-2 text-sm leading-relaxed text-brand-on-navy">{tr.buildingBody}</p>
        </div>
      ) : (
        <div className="mt-5">
          <p className="flex items-baseline gap-2">
            <span className="text-5xl font-semibold tracking-[-0.04em] text-brand-mint tabular-nums">{Math.round(score)}</span>
            <span className="text-sm font-medium text-brand-on-navy">{tr.outOf}</span>
          </p>
          <div
            role="meter"
            aria-label={tr.title}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(score)}
            className="mt-4 h-2 overflow-hidden rounded-full bg-brand-white/10"
          >
            <div className="h-full rounded-full bg-brand-mint" style={{ width: `${Math.min(100, Math.max(0, score))}%` }} />
          </div>
        </div>
      )}

      <dl className="mt-5">
        {score !== null && <TrustStat label={tr.reliability} value={rate === null ? "—" : `${rate}%`} />}
        <TrustStat label={tr.verified} value={onTime + late} />
        <TrustStat label={tr.onTime} value={onTime} />
        <TrustStat label={tr.completedCircles} value={data.record.circlesCompleted} />
        {score === null && <TrustStat label={tr.identity} value={kycApproved ? tr.identityApproved : tr.identityPending} />}
      </dl>

      <details className="group mt-4 rounded-2xl border border-brand-white/10 bg-brand-white/5 text-sm">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 font-semibold text-brand-mint [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            <HelpCircle className="size-4" aria-hidden="true" />
            {tr.how}
          </span>
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <ul className="space-y-1.5 px-4 pb-4 text-brand-on-navy">
          {tr.howItems.map((item) => (
            <li key={item} className="flex gap-2">
              <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-brand-mint" />
              {item}
            </li>
          ))}
        </ul>
      </details>
      <p className="mt-3 text-xs leading-relaxed text-brand-on-navy">{tr.disclaimer}</p>
    </section>
  )
}

// ── My circles ──────────────────────────────────────────────────────────────

function CircleRow({ circle, authorized, t, locale }: { circle: DashboardCircle; authorized: boolean; t: T; locale: Locale }) {
  const c = t.circles
  const action = circleAction(circle, authorized)
  const owedRound = action?.round && action.kind !== "FAILED" ? action.round : null
  const currentMine = circle.rounds.find((r) => r.number === circle.currentRound)?.myStatus ?? null

  return (
    <li className="rounded-3xl border border-brand-line bg-brand-canvas p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-brand-navy">{circle.name}</p>
          <p className="mt-0.5 text-xs font-medium text-brand-slate">
            {circle.status === "OPEN"
              ? c.notStarted
              : circle.currentRound !== null
                ? fill(c.roundOf, { round: circle.currentRound, size: circle.size })
                : t.payStatus.NONE}
          </p>
        </div>
        {circle.status === "ACTIVE" && <PaymentBadge status={currentMine} t={t.payStatus} />}
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-x-4 gap-y-2 text-sm min-[400px]:grid-cols-2">
        <div>
          <dt className="text-xs text-brand-slate">{c.contribution[circle.cadence]}</dt>
          <dd className="font-semibold text-brand-navy tabular-nums">{formatAmount(circle.contribution, locale)}</dd>
        </div>
        <div>
          <dt className="text-xs text-brand-slate">{c.position}</dt>
          <dd className="font-semibold text-brand-navy">
            {fill(c.positionValue, { round: circle.myPayoutRound, size: circle.size })}
            {circle.status === "OPEN" && <span className="ml-1 text-xs font-normal text-brand-slate">{c.provisional}</span>}
          </dd>
        </div>
        <div className="min-[400px]:col-span-2">
          <dt className="text-xs text-brand-slate">{c.nextContribution}</dt>
          <dd className="font-semibold text-brand-navy">{owedRound ? formatDate(owedRound.deadline, locale) : "—"}</dd>
        </div>
      </dl>

      <Link
        href={`/${locale}/circles/${circle.id}`}
        className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand-violet-ink hover:underline"
      >
        {c.view}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </li>
  )
}

export function MyCirclesSummary({ data, t, locale }: { data: Dashboard; t: T; locale: Locale }) {
  const c = t.circles
  const live = data.circles.filter((x) => x.status !== "COMPLETED")
  const activeCount = data.circles.filter((x) => x.status === "ACTIVE" || x.status === "OPEN").length
  const completedCount = data.circles.length - live.length
  const authorized = isAuthorized(data.wallet)

  return (
    <section aria-labelledby="circles-title" className={cn(card, "lg:col-span-7")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="circles-title" className="text-lg font-semibold tracking-[-0.02em] text-brand-navy">
          {c.title}
        </h2>
        <p className="flex gap-2 text-xs font-semibold">
          <span className={cn(chip, "bg-brand-mint text-brand-navy")}>{fill(c.active, { count: activeCount })}</span>
          <span className={cn(chip, "border border-brand-line text-brand-navy")}>{fill(c.completed, { count: completedCount })}</span>
        </p>
      </div>

      {live.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-dashed border-brand-line p-6 text-center">
          <Users className="mx-auto size-6 text-brand-slate" aria-hidden="true" />
          <p className="mt-2 text-sm text-brand-slate">{c.empty}</p>
          <Link href={`/${locale}/circles`} className={cn(primaryLink, "mt-4")}>
            {t.next.explore}
          </Link>
        </div>
      ) : (
        <ul className="mt-5 grid grid-cols-1 gap-3">
          {live.map((circle) => (
            <CircleRow key={circle.id} circle={circle} authorized={authorized} t={t} locale={locale} />
          ))}
        </ul>
      )}

      <Link href={`/${locale}/circles`} className={cn(secondaryLink, "mt-5 w-full sm:w-auto")}>
        {t.viewAllCircles}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </section>
  )
}

// ── Payout tracking ─────────────────────────────────────────────────────────

// At most this many rounds in the progression; longer circles show a window around the current one.
const TIMELINE_ROWS = 6

export function UpcomingPayoutCard({ data, t, roundStates, locale }: { data: Dashboard; t: T; roundStates: Dictionary["circle"]["states"]; locale: Locale }) {
  const p = t.payout
  const view = nextPayout(data.circles)
  if (!view?.round) return null
  const { circle, round } = view
  const rounds = [...circle.rounds].sort((a, b) => a.number - b.number)
  const anchor = Math.max(0, Math.min((circle.currentRound ?? 1) - 2, rounds.length - TIMELINE_ROWS))
  const shown = rounds.slice(anchor, anchor + TIMELINE_ROWS)
  const closed = rounds.filter((r) => r.state !== "UPCOMING" && r.state !== "COLLECTING").length

  return (
    <section aria-labelledby="payout-title" className={card}>
      <SectionLabel icon={Gift}>
        <span id="payout-title">{p.title}</span>
      </SectionLabel>
      <p className="mt-4 text-sm font-semibold text-brand-slate">{circle.name}</p>
      <p className="mt-1 text-3xl font-semibold tracking-[-0.03em] text-brand-navy tabular-nums">
        <span className="mr-2 align-middle text-xs font-semibold uppercase tracking-[0.08em] text-brand-slate">{p.expected}</span>
        {formatAmount(circle.expectedPayout, locale)}
      </p>

      <dl className="mt-4 grid grid-cols-1 gap-3 text-sm min-[400px]:grid-cols-3">
        <div>
          <dt className="text-xs text-brand-slate">{p.position}</dt>
          <dd className="font-semibold text-brand-navy">{fill(t.circles.positionValue, { round: round.number, size: circle.size })}</dd>
        </div>
        <div>
          <dt className="text-xs text-brand-slate">{p.periodEnds}</dt>
          <dd className="font-semibold text-brand-navy">{formatDate(round.deadline, locale)}</dd>
        </div>
        <div>
          <dt className="text-xs text-brand-slate">{p.progress}</dt>
          <dd className="font-semibold text-brand-navy tabular-nums">
            {closed} / {circle.size}
          </dd>
        </div>
      </dl>

      <ol className="mt-5 space-y-2" aria-label={p.progress}>
        {shown.map((r) => {
          const isCurrent = r.number === circle.currentRound
          const tag = r.mine ? p.mine : isCurrent ? p.current : r.state === "UPCOMING" ? p.upcoming : roundStates[r.state]
          const done = r.state === "FUNDED" || r.state === "PAID_OUT"
          const Icon = done ? CircleCheck : isCurrent ? CircleDashed : r.mine ? Gift : Clock
          return (
            <li
              key={r.number}
              className={cn(
                "flex items-center justify-between gap-3 rounded-2xl px-3 py-2 text-sm",
                r.mine ? "bg-brand-mint text-brand-navy" : isCurrent ? "bg-brand-mist text-brand-navy" : "text-brand-navy",
              )}
            >
              <span className="inline-flex items-center gap-2 font-medium">
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {fill(t.next.roundOf, { round: r.number, size: circle.size })}
              </span>
              <span className="text-xs font-semibold">{tag}</span>
            </li>
          )
        })}
      </ol>

      <p className="mt-4 text-xs leading-relaxed text-brand-slate">{p.note}</p>
      <Link
        href={`/${locale}/circles/${circle.id}`}
        className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand-violet-ink hover:underline"
      >
        {p.schedule}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </section>
  )
}

// ── Round funding ───────────────────────────────────────────────────────────

export function CircleFundingProgress({ data, t, locale }: { data: Dashboard; t: T; locale: Locale }) {
  const f = t.funding
  const views = roundFunding(data.circles)
  if (views.length === 0) return null

  return (
    <section aria-labelledby="funding-title" className={card}>
      <SectionLabel icon={ShieldCheck}>
        <span id="funding-title">{f.title}</span>
      </SectionLabel>
      <ul className="mt-4 space-y-5">
        {views.map(({ circle, round, collected, target }) => {
          const pct = percent(collected, target)
          const money = (v: bigint) => formatAmount(amount(v, circle.contribution), locale)
          return (
            <li key={circle.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-brand-navy">{circle.name}</p>
                <p className="text-xs font-medium text-brand-slate">{fill(t.next.roundOf, { round: round.number, size: circle.size })}</p>
              </div>
              <p className="mt-1 text-sm text-brand-navy">{fill(f.received, { verified: round.verified, size: circle.size })}</p>
              <div
                role="progressbar"
                aria-label={circle.name}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
                className="mt-2 h-2 overflow-hidden rounded-full bg-brand-mist"
              >
                <div className="h-full rounded-full bg-brand-violet" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs">
                <span className="font-semibold text-brand-navy tabular-nums">
                  {money(collected)} / {money(target)}
                </span>
                <span className="text-brand-slate">{fill(f.funded, { percent: pct })}</span>
              </div>
              <p className="mt-1 text-xs font-medium text-brand-navy">
                {fill(f.status[round.state], { missing: Math.max(0, circle.size - round.verified) })}
              </p>
            </li>
          )
        })}
      </ul>
      <p className="mt-4 text-xs leading-relaxed text-brand-slate">{f.note}</p>
    </section>
  )
}

// ── Connected wallet ────────────────────────────────────────────────────────

function host(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function WalletRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-t border-brand-line py-3 first:border-t-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <dt className="text-xs font-medium text-brand-slate">{label}</dt>
      <dd className="min-w-0 text-sm font-semibold text-brand-navy sm:text-right">{children}</dd>
    </div>
  )
}

type WalletCardProps = {
  data: Dashboard
  t: T
  /** The wallet form's copy lives with onboarding, where the same form is used. */
  onboarding: Dictionary["onboarding"]
  /** From `?consent=` after a failed link attempt that started on this page. */
  consentError: ProfileErrorKey | null
  locale: Locale
}

export function ConnectedWalletCard({ data, t, onboarding, consentError, locale }: WalletCardProps) {
  const w = t.wallet
  const wallet = data.wallet
  // Linking (or re-authorizing) happens right here; the consent callback returns to this page.
  const returnPath = `/${locale}/account`

  if (!wallet) {
    return (
      <section id="wallet" aria-labelledby="wallet-title" className={cn(card, "scroll-mt-24 lg:col-span-7")}>
        <SectionLabel icon={Wallet}>
          <span id="wallet-title">{w.title}</span>
        </SectionLabel>
        <p className="mt-5 text-xl font-semibold text-brand-navy">{w.noneTitle}</p>
        <p className="mt-1 text-sm text-brand-slate">{w.noneBody}</p>
        <div className="mt-5">
          <WalletForm locale={locale} t={onboarding} returnPath={returnPath} initialError={consentError} />
        </div>
      </section>
    )
  }

  const auth = wallet.authorization
  const authorized = auth.status === "ACTIVE"
  return (
    <section id="wallet" aria-labelledby="wallet-title" className={cn(card, "scroll-mt-24 lg:col-span-7")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionLabel icon={Wallet}>
          <span id="wallet-title">{w.title}</span>
        </SectionLabel>
        <span className={cn(chip, authorized ? "bg-brand-mint text-brand-navy" : "bg-brand-navy text-brand-white")}>
          {authorized ? <ShieldCheck className="size-3.5" aria-hidden="true" /> : <KeyRound className="size-3.5" aria-hidden="true" />}
          {w.auth[auth.status]}
        </span>
      </div>

      <div className="mt-5 rounded-2xl border border-brand-line bg-brand-canvas p-3 sm:p-4">
        <p className="text-xs font-medium text-brand-slate">{w.address}</p>
        <code className="mt-1 block break-all font-mono text-xs font-semibold text-brand-navy sm:text-sm">{wallet.address}</code>
        <div className="mt-3">
          <CopyButton value={wallet.address} label={w.copy} copiedLabel={w.copied} />
        </div>
      </div>

      <dl className="mt-4">
        <WalletRow label={w.provider}>
          <span className="break-all">{host(wallet.address)}</span>
        </WalletRow>
        <WalletRow label={w.network}>{w.networkValue}</WalletRow>
        <WalletRow label={w.connection}>
          <span className="inline-flex items-center gap-1.5">
            <CircleCheck className="size-4 text-brand-violet-ink" aria-hidden="true" />
            {w.linked}
          </span>
        </WalletRow>
        <WalletRow label={w.authorization}>
          {w.auth[auth.status]}
          {auth.since && <span className="ml-1 font-normal text-brand-slate">{fill(w.since, { date: formatDate(auth.since, locale) })}</span>}
        </WalletRow>
      </dl>

      <p className="mt-3 text-xs leading-relaxed text-brand-slate">{w.authHelp}</p>
      <p className="mt-1 text-xs leading-relaxed text-brand-slate">{w.oneWallet}</p>
      <details className="group mt-5" open={consentError !== null}>
        <summary className={cn(authorized ? secondaryLink : primaryLink, "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
          <KeyRound className="size-4" aria-hidden="true" />
          {authorized ? w.renew : w.authorize}
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="mt-4">
          <WalletForm locale={locale} t={onboarding} returnPath={returnPath} initialError={consentError} />
        </div>
      </details>
    </section>
  )
}

// ── OpenCircle internal account ─────────────────────────────────────────────

function counterpartyLabel(movement: Movement, i: T["internal"]): string {
  const cp = movement.counterparty
  return i.counterparties[cp.kind === "SYSTEM" ? cp.code : cp.kind]
}

const MOVEMENT_ROWS = 6

export function InternalAccountCard({
  data,
  t,
  onboarding,
  locale,
}: {
  data: Dashboard
  t: T
  onboarding: Dictionary["onboarding"]
  locale: Locale
}) {
  const i = t.internal
  const account = data.internalAccount

  if (!account) {
    return (
      <section id="internal-account" aria-labelledby="internal-account-title" className={cn(card, "scroll-mt-24 lg:col-span-5")}>
        <SectionLabel icon={Coins}>
          <span id="internal-account-title">{i.title}</span>
        </SectionLabel>
        <p className="mt-5 text-xl font-semibold text-brand-navy">{i.noneTitle}</p>
        <p className="mt-1 text-sm text-brand-slate">{i.noneBody}</p>
        <div className="mt-5">
          <CreateAccountForm locale={locale} returnPath={`/${locale}/account`} t={onboarding} />
        </div>
      </section>
    )
  }

  return (
    <section id="internal-account" aria-labelledby="internal-account-title" className={cn(card, "scroll-mt-24 lg:col-span-5")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionLabel icon={Coins}>
          <span id="internal-account-title">{i.title}</span>
        </SectionLabel>
        <span className={cn(chip, "bg-brand-mist text-brand-navy")}>
          <FlaskConical className="size-3.5" aria-hidden="true" />
          {t.demoBadge}
        </span>
      </div>

      <p className="mt-5 text-xs font-medium text-brand-slate">{i.balance}</p>
      <p className="mt-1 text-3xl font-semibold tracking-[-0.03em] text-brand-navy tabular-nums">{formatAmount(account.balance, locale)}</p>
      <p className="mt-2 text-xs text-brand-slate">
        {i.idLabel} · <code className="font-mono font-semibold text-brand-navy">{account.id.slice(0, 8).toUpperCase()}</code>
      </p>
      <p className="mt-3 text-xs leading-relaxed text-brand-slate">{i.custody}</p>
      <Link href={`/${locale}/account/deposit`} className={cn(primaryLink, "mt-5")}>
        <ArrowDownToLine className="size-4" aria-hidden="true" />
        {i.deposit}
      </Link>

      <h3 className="mt-6 text-xs font-semibold uppercase tracking-[0.08em] text-brand-slate">{i.movementsTitle}</h3>
      {account.movements.length === 0 ? (
        <p className="mt-2 text-sm text-brand-slate">{i.movementsEmpty}</p>
      ) : (
        <ol className="mt-2 divide-y divide-brand-line">
          {account.movements.slice(0, MOVEMENT_ROWS).map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-brand-navy">{i.kinds[m.kind]}</p>
                <p className="truncate text-xs text-brand-slate">
                  {counterpartyLabel(m, i)} · {formatDate(m.createdAt, locale)}
                </p>
              </div>
              <span className={cn("shrink-0 text-sm font-semibold tabular-nums", m.direction === "IN" ? "text-brand-navy" : "text-brand-slate")}>
                {m.direction === "IN" ? "+" : "−"}
                {formatAmount(m.amount, locale)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

// ── Personal profile ────────────────────────────────────────────────────────

function countryName(code: string, locale: Locale): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code
  } catch {
    return code
  }
}

export function PersonalProfileCard({
  profile,
  email,
  kycApproved,
  t,
  locale,
}: {
  profile: Profile
  email: string
  kycApproved: boolean
  t: T
  locale: Locale
}) {
  const pr = t.profile
  const name = profile.fullName ?? email.split("@")[0] ?? email
  return (
    <section aria-labelledby="profile-title" className={cn(card, "flex flex-col lg:col-span-5")}>
      <h2 id="profile-title" className="sr-only">
        {pr.title}
      </h2>
      <SectionLabel icon={Users}>{pr.title}</SectionLabel>
      <div className="mt-5 flex items-center gap-4">
        <div
          aria-hidden="true"
          className="grid size-14 shrink-0 place-items-center rounded-full bg-brand-navy text-lg font-semibold text-brand-mint"
        >
          {name.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold tracking-[-0.02em] text-brand-navy">{name}</p>
          <p className="truncate text-sm text-brand-slate">{email}</p>
        </div>
      </div>

      <dl className="mt-5 space-y-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-brand-slate">{pr.nationality}</dt>
          <dd className="font-semibold text-brand-navy">
            <span aria-hidden="true">{flagOf(profile.nationality)} </span>
            {countryName(profile.nationality, locale)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-brand-slate">{t.trust.identity}</dt>
          <dd>
            {kycApproved ? (
              <span className={cn(chip, "bg-brand-mint text-brand-navy")}>
                <ShieldCheck className="size-3.5" aria-hidden="true" />
                {pr.verified}
              </span>
            ) : (
              <span className={cn(chip, "border border-brand-slate text-brand-navy")}>
                <Clock className="size-3.5" aria-hidden="true" />
                {pr.pending}
              </span>
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-auto flex flex-wrap gap-3 pt-6">
        <Link href={`/${locale}/onboarding?edit=profile`} className={secondaryLink}>
          {pr.edit}
        </Link>
        {!kycApproved && (
          <Link href={`/${locale}/circles/new`} className={primaryLink}>
            {pr.verify}
          </Link>
        )}
      </div>
    </section>
  )
}

// ── Recent activity ─────────────────────────────────────────────────────────

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-brand-slate">{label}</dt>
      <dd className="mt-0.5 break-all text-sm font-medium text-brand-navy">{children}</dd>
    </div>
  )
}

function TransactionDetails({ item, t, locale }: { item: Activity; t: T; locale: Locale }) {
  const d = t.activity.details
  const failure = failureText(item.failureCode, t.next.failure)
  return (
    <dl className="grid grid-cols-1 gap-4 border-t border-brand-line px-4 py-4 sm:grid-cols-2 sm:px-5">
      <Detail label={d.reference}>
        <code className="font-mono text-xs">{item.id}</code>
      </Detail>
      <Detail label={d.type}>{t.activity.contribution}</Detail>
      <Detail label={t.activity.circle}>
        <Link href={`/${locale}/circles/${item.circleId}`} className="text-brand-violet-ink hover:underline">
          {item.circleName}
        </Link>{" "}
        · {fill(t.activity.roundLabel, { round: item.roundNumber })}
      </Detail>
      <Detail label={`${t.activity.amount} · ${d.currency}`}>
        {formatAmount(item.amount, locale)} · {item.amount.assetCode}
      </Detail>
      <Detail label={d.from}>{item.fromWallet ?? "—"}</Detail>
      <Detail label={d.to}>{item.toWallet}</Detail>
      <Detail label={d.created}>{dateTime(item.createdAt, locale)}</Detail>
      {item.requestedAt && <Detail label={d.requested}>{dateTime(item.requestedAt, locale)}</Detail>}
      {item.completedAt && <Detail label={d.completed}>{dateTime(item.completedAt, locale)}</Detail>}
      <Detail label={d.deadline}>{dateTime(item.deadline, locale)}</Detail>
      <Detail label={t.activity.status}>
        <PaymentBadge status={item.status} t={t.payStatus} />
        {failure && <span className="mt-1 block text-xs font-normal text-brand-slate">{failure}</span>}
      </Detail>
      {item.incomingPaymentUrl && (
        <Detail label={d.incoming}>
          <code className="font-mono text-xs">{item.incomingPaymentUrl}</code>
        </Detail>
      )}
      {item.outgoingPaymentUrl && (
        <Detail label={d.outgoing}>
          <code className="font-mono text-xs">{item.outgoingPaymentUrl}</code>
        </Detail>
      )}
    </dl>
  )
}

const ROW = "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 sm:grid-cols-[5.5rem_minmax(0,1.4fr)_minmax(0,1fr)_7.5rem_8rem]"

export function RecentTransactions({ data, t, locale }: { data: Dashboard; t: T; locale: Locale }) {
  const a = t.activity
  return (
    <section aria-labelledby="activity-title" className={cn(card, "mt-6")}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="activity-title" className="text-lg font-semibold tracking-[-0.02em] text-brand-navy">
            {a.title}
          </h2>
          <p className="mt-1 text-sm text-brand-slate">{a.lead}</p>
        </div>
      </div>

      {data.activity.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-dashed border-brand-line p-8 text-center">
          <Coins className="mx-auto size-6 text-brand-slate" aria-hidden="true" />
          <p className="mt-3 font-semibold text-brand-navy">{a.emptyTitle}</p>
          <p className="mt-1 text-sm text-brand-slate">{a.emptyBody}</p>
          <Link href={`/${locale}/circles`} className={cn(primaryLink, "mt-5")}>
            {a.explore}
          </Link>
        </div>
      ) : (
        <>
          <div aria-hidden="true" className={cn(ROW, "mt-6 hidden px-5 pb-2 text-xs font-semibold text-brand-slate sm:grid")}>
            <span>{a.date}</span>
            <span>{a.description}</span>
            <span>{a.circle}</span>
            <span className="text-right">{a.amount}</span>
            <span className="text-right">{a.status}</span>
          </div>
          <ul className="mt-4 space-y-2 sm:mt-0">
            {data.activity.map((item) => {
              const when = item.completedAt ?? item.requestedAt ?? item.createdAt
              return (
                <li key={item.id}>
                  <details className="group rounded-2xl border border-brand-line bg-brand-white transition-colors open:bg-brand-canvas hover:bg-brand-canvas">
                    <summary className={cn(ROW, "min-h-14 cursor-pointer list-none px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden")}>
                      <span className="order-3 text-xs text-brand-slate sm:order-none sm:text-sm sm:text-brand-navy">
                        <time dateTime={when}>{shortDate(when, locale)}</time>
                      </span>
                      <span className="order-1 min-w-0 sm:order-none">
                        <span className="block truncate text-sm font-semibold text-brand-navy">{a.contribution}</span>
                        <span className="block truncate text-xs text-brand-slate sm:hidden">{item.circleName}</span>
                      </span>
                      <span className="hidden min-w-0 truncate text-sm text-brand-navy sm:block">{item.circleName}</span>
                      <span className="order-2 text-right text-sm font-semibold text-brand-navy tabular-nums sm:order-none">
                        {formatAmount(amount(-toBig(item.amount), item.amount), locale)}
                      </span>
                      <span className="order-4 flex items-center justify-end gap-2 sm:order-none">
                        <PaymentBadge status={item.status} t={t.payStatus} />
                        <ChevronDown className="size-4 shrink-0 text-brand-slate transition-transform group-open:rotate-180" aria-hidden="true" />
                      </span>
                    </summary>
                    <TransactionDetails item={item} t={t} locale={locale} />
                  </details>
                </li>
              )
            })}
          </ul>
          <p className="mt-4 text-xs text-brand-slate">{a.payoutsNote}</p>
        </>
      )}
    </section>
  )
}
