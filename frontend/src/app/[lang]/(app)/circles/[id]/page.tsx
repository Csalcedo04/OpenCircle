import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, CircleCheck, CircleDashed, Lock, ShieldCheck, Undo2 } from "lucide-react"
import { CircleRing } from "@/components/circle-ring"
import { RoundStatusBadge } from "@/components/round-status"
import { Stars, TrustDial, initials } from "@/components/trust"
import { buttonVariants } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { fill } from "@/i18n/config"
import { getDictionary } from "@/i18n/get-dictionary"
import { getCircle, listCircles, listMembers, listReviews } from "@/lib/data"
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

export async function generateStaticParams() {
  const circles = await listCircles()
  return circles.map((c) => ({ id: c.id }))
}

export async function generateMetadata({ params }: PageProps<"/[lang]/circles/[id]">): Promise<Metadata> {
  const circle = await getCircle((await params).id)
  return { title: circle?.name ?? "OpenCircle" }
}

const PATH: RoundState[] = ["COLLECTING", "FUNDED", "RISK_CHECK", "PAYING_OUT", "PAID_OUT"]
const ENGINE_STATES: RoundStatus[] = ["FUNDED", "RISK_CHECK", "BLOCKED", "PAYING_OUT", "PAID_OUT"]

const contributionIcon: Record<ContributionStatus, typeof CircleCheck> = {
  VERIFIED: CircleCheck,
  PENDING: CircleDashed,
  MISSING: Lock,
  REFUNDED: Undo2,
}

export default async function CirclePage({ params }: PageProps<"/[lang]/circles/[id]">) {
  const { id } = await params
  const { locale, t } = await getDictionary()
  const [circle, members, reviews] = await Promise.all([getCircle(id), listMembers(), listReviews()])
  if (!circle) notFound()

  const byId = new Map(members.map((m) => [m.id, m]))
  const nameOf = (memberId: string) => byId.get(memberId)?.name ?? memberId
  const money = (v: bigint) => formatAmount(amount(v, circle.contribution), locale)
  const round = currentRound(circle)
  const pot = potFor(circle)
  const balance = poolBalance(circle)
  const seats = [...circle.seats].sort((a, b) => a.payoutRound - b.payoutRound)
  const circleReviews = reviews.filter((r) => r.circleId === circle.id)
  const beneficiarySeat = round ? seatFor(circle, round.beneficiaryId) : undefined
  const coverage = beneficiarySeat ? evaluateCoverage(circle, beneficiarySeat) : undefined
  const beneficiaryName = round ? firstName(nameOf(round.beneficiaryId)) : ""
  const pathIndex = round ? PATH.indexOf(round.status === "BLOCKED" ? "RISK_CHECK" : (round.status as RoundState)) : -1
  const openSeats = circle.size - circle.seats.length

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Link href={`/${locale}/circles`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t.circles.title}
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-heading text-4xl font-semibold tracking-tight">{circle.name}</h1>
          <p className="mt-1 text-muted-foreground">
            {circle.city}, {fill(t.circles.members, { count: circle.size })}, {formatAmount(circle.contribution, locale)} {t.circles.perRound}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {t.circle.poolWallet}: <span className="break-all text-foreground">{circle.poolWalletAddress}</span>
          </p>
        </div>
        {circle.status === "OPEN" ? (
          <Link href={`/${locale}/circles/${circle.id}/join`} className={cn(buttonVariants({ size: "lg" }), "h-11 px-5 text-base")}>
            {t.circle.joinCta}
          </Link>
        ) : (
          round && <RoundStatusBadge status={round.status} label={t.circle.states[round.status]} className="text-sm" />
        )}
      </header>

      {circle.status === "OPEN" || !round ? (
        <section className="mt-10 grid items-center gap-10 md:grid-cols-2">
          <CircleRing
            className="mx-auto max-w-md"
            seats={seats.map((s) => ({ id: s.memberId, initials: initials(nameOf(s.memberId)), label: nameOf(s.memberId), state: "verified", beneficiary: false }))}
            progress={percent(BigInt(circle.seats.length), BigInt(circle.size))}
            amount={money(pot)}
            caption={t.circle.potLabel}
            title={circle.name}
          />
          <div>
            <p className="font-heading text-2xl font-semibold">{fill(t.circle.openSeats, { count: openSeats, size: circle.size })}</p>
            <p className="mt-2 text-muted-foreground">{fill(t.circles.notStarted, { size: circle.size })}</p>
            <Breakdown t={t} pot={money(pot)} fee={money(feeFor(circle))} payout={money(payoutFor(circle))} rate={formatBps(circle.feeBps, locale)} />
          </div>
        </section>
      ) : (
        <section className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div>
            <CircleRing
              className="mx-auto max-w-md"
              seats={ringSeats(circle, round, byId)}
              progress={percent(collectedFor(circle, round), pot)}
              amount={money(collectedFor(circle, round))}
              caption={`/ ${money(pot)}`}
              title={fill(t.circle.collected, { verified: verifiedCount(round), size: circle.size })}
            />
            <ul className="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <span aria-hidden="true" className="size-3 rounded-full bg-brand-violet" />
                {t.circle.legend.verified}
              </li>
              <li className="flex items-center gap-2">
                <span aria-hidden="true" className="size-3 rounded-full border border-dashed border-brand-slate" />
                {t.circle.legend.pending}
              </li>
              <li className="flex items-center gap-2">
                <span aria-hidden="true" className="size-3 rounded-full ring-2 ring-brand-navy ring-offset-2 ring-offset-brand-canvas" />
                {t.circle.legend.beneficiary}
              </li>
            </ul>

            <div className="mt-8 rounded-2xl bg-brand-navy p-6 text-brand-white">
              <p className="text-sm text-brand-on-navy">{t.circle.poolBalance}</p>
              <p className="mt-1 font-heading text-4xl font-semibold tabular-nums">{money(balance.total)}</p>
              <p className="mt-2 text-sm text-brand-on-navy">
                {fill(t.circle.balanceParts, { round: money(balance.round), collateral: money(balance.collateral), fees: money(balance.fees) })}
              </p>
            </div>
          </div>

          <div className="space-y-8">
            <div>
              <h2 className="font-heading text-xl font-semibold">{fill(t.circle.currentRound, { round: round.number })}</h2>
              <p className="mt-1 text-muted-foreground">
                {t.circle.beneficiary}:{" "}
                <Link href={`/${locale}/members/${round.beneficiaryId}`} className="font-medium text-foreground hover:underline">
                  {nameOf(round.beneficiaryId)}
                </Link>
                . {fill(t.circle.deadline, { date: formatDate(round.deadline, locale) })}
              </p>
              <ol className="mt-5 grid grid-cols-5 gap-1" aria-label={t.circle.stateTitle}>
                {PATH.map((state, i) => {
                  const done = i < pathIndex || round.status === "PAID_OUT"
                  const current = i === pathIndex && round.status !== "PAID_OUT"
                  const held = current && round.status === "BLOCKED"
                  return (
                    <li key={state} aria-current={current ? "step" : undefined} className="flex flex-col gap-2">
                      <span
                        className={cn(
                          "h-1.5 rounded-full",
                          done ? "bg-brand-violet" : current ? "bg-brand-navy" : "bg-brand-line",
                        )}
                      />
                      <span className={cn("text-xs", current ? "font-semibold" : "text-muted-foreground")}>
                        {held ? t.circle.states.BLOCKED : t.circle.states[state]}
                      </span>
                    </li>
                  )
                })}
              </ol>
              <p className="mt-3 text-sm">{t.circle.stateHelp[round.status]}</p>
            </div>

            <div>
              <h2 className="font-heading text-xl font-semibold">{t.circle.contributionsTitle}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{fill(t.circle.collected, { verified: verifiedCount(round), size: circle.size })}</p>
              <ul className="mt-3 divide-y divide-border border-y border-border">
                {round.contributions.map((c) => {
                  const Icon = contributionIcon[c.status]
                  return (
                    <li key={c.memberId} className="flex items-center justify-between gap-3 py-2.5">
                      <Link href={`/${locale}/members/${c.memberId}`} className="truncate hover:underline">
                        {nameOf(c.memberId)}
                      </Link>
                      <span className="flex shrink-0 items-center gap-3 text-sm">
                        <span className="tabular-nums">{formatAmount(circle.contribution, locale)}</span>
                        <span className={cn("inline-flex w-28 items-center gap-1.5", c.status === "VERIFIED" ? "text-brand-violet-ink" : "text-foreground")}>
                          <Icon className="size-4" aria-hidden="true" />
                          {t.circle.contribution[c.status]}
                        </span>
                      </span>
                    </li>
                  )
                })}
              </ul>
              {round.status === "COLLECTING" && <p className="mt-2 text-sm text-muted-foreground">{t.circle.refundNote}</p>}
            </div>

            <Breakdown t={t} pot={money(pot)} fee={money(feeFor(circle))} payout={money(payoutFor(circle))} rate={formatBps(circle.feeBps, locale)} />

            <div className={cn("rounded-2xl border-2 p-5", coverage && !coverage.eligible && ENGINE_STATES.includes(round.status) ? "border-brand-navy" : "border-brand-line")}>
              <h2 className="flex items-center gap-2 font-heading text-xl font-semibold">
                <ShieldCheck className="size-5 text-brand-violet-ink" aria-hidden="true" />
                {t.circle.engineTitle}
              </h2>
              {coverage && ENGINE_STATES.includes(round.status) ? (
                <>
                  <p className="mt-1 text-sm text-muted-foreground">{fill(t.circle.engineLead, { name: beneficiaryName })}</p>
                  <dl className="mt-4 space-y-1.5 text-sm">
                    <Row label={t.circle.owes} value={money(coverage.owes)} />
                    <Row label={t.circle.collateral} value={`− ${money(coverage.collateral)}`} />
                    <Row label={fill(t.circle.grant, { weight: formatBps(circle.grantWeightBps, locale) })} value={`− ${money(coverage.grantCoverage)}`} />
                    <Row label={t.circle.uncovered} value={money(coverage.uncovered)} strong />
                    <Row label={t.circle.threshold} value={money(coverage.threshold)} />
                  </dl>
                  <p
                    className={cn(
                      "mt-4 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm font-medium",
                      coverage.eligible ? "bg-brand-violet text-brand-white" : "bg-brand-navy text-brand-white",
                    )}
                  >
                    {coverage.eligible ? <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
                    {coverage.eligible ? t.circle.eligible : fill(t.circle.blocked, { name: beneficiaryName })}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">{t.circle.noEngine}</p>
              )}
            </div>
          </div>
        </section>
      )}

      <Tabs defaultValue="order" className="mt-14">
        <TabsList>
          <TabsTrigger value="order">{t.circle.tabs.order}</TabsTrigger>
          <TabsTrigger value="members">{t.circle.tabs.members}</TabsTrigger>
          <TabsTrigger value="reviews">
            {t.circle.tabs.reviews} ({circleReviews.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="order" className="mt-4">
          <ol className="divide-y divide-border border-y border-border">
            {seats.map((seat) => {
              const r = circle.rounds.find((x) => x.number === seat.payoutRound)
              return (
                <li key={seat.memberId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span className="flex items-center gap-3">
                    <span className="w-20 text-sm text-muted-foreground">{fill(t.circle.seat, { round: seat.payoutRound })}</span>
                    <Link href={`/${locale}/members/${seat.memberId}`} className="font-medium hover:underline">
                      {nameOf(seat.memberId)}
                    </Link>
                  </span>
                  {r && <RoundStatusBadge status={r.status} label={t.circle.states[r.status]} />}
                </li>
              )
            })}
          </ol>
        </TabsContent>

        <TabsContent value="members" className="mt-4">
          <ul className="grid gap-4 sm:grid-cols-2">
            {seats.map((seat) => {
              const m = byId.get(seat.memberId)
              if (!m) return null
              const trust = trustFor(m, reviews)
              return (
                <li key={m.id} className="flex items-center gap-4 rounded-xl border border-border p-4">
                  <TrustDial trust={trust} label={t.member.trustScore} />
                  <div className="min-w-0">
                    <Link href={`/${locale}/members/${m.id}`} className="font-medium hover:underline">
                      {m.name}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {t.member.levels[trust.level]}. {t.circle.grantModes[seat.grant ?? "NONE"]}
                      {BigInt(seat.collateralValue) > 0n ? `, ${t.circle.collateral.toLowerCase()} ${money(BigInt(seat.collateralValue))}` : ""}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        </TabsContent>

        <TabsContent value="reviews" className="mt-4">
          {circleReviews.length === 0 ? (
            <p className="text-muted-foreground">{t.circle.noReviews}</p>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {circleReviews.map((r) => (
                <li key={r.id} className="rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <Link href={`/${locale}/members/${r.subjectId}`} className="font-medium hover:underline">
                      {nameOf(r.subjectId)}
                    </Link>
                    <Stars rating={r.rating} label={fill(t.member.rating, { rating: r.rating })} />
                  </div>
                  <p className="mt-2 leading-relaxed">“{r.comment}”</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {nameOf(r.authorId)}, {formatDate(r.date, locale)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

type Dict = Awaited<ReturnType<typeof getDictionary>>["t"]

function Breakdown({ t, pot, fee, payout, rate }: { t: Dict; pot: string; fee: string; payout: string; rate: string }) {
  return (
    <div className="mt-6">
      <h2 className="font-heading text-xl font-semibold">{t.circle.breakdownTitle}</h2>
      <dl className="mt-3 space-y-1.5 text-sm">
        <Row label={t.circle.potLabel} value={pot} />
        <Row label={fill(t.circle.fee, { rate })} value={`− ${fee}`} />
        <Row label={t.circle.payout} value={payout} strong />
      </dl>
    </div>
  )
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4", strong && "border-t border-border pt-1.5 font-semibold")}>
      <dt className={cn(!strong && "text-muted-foreground")}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
}
