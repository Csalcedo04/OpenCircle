import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Calendar, Coins, MapPin, Plus, Shield, Users } from "lucide-react"
import { RoundStatusBadge } from "@/components/round-status"
import { Avatar, PEOPLE } from "@/components/landing/shared"
import { fill } from "@/i18n/config"
import { getDictionary } from "@/i18n/get-dictionary"
import { listCircles, listMembers, listReviews } from "@/lib/data"
import { amount, formatAmount } from "@/lib/domain/money"
import { currentRound, potFor } from "@/lib/domain/rounds"
import { trustFor } from "@/lib/domain/trust"
import { cn } from "@/lib/utils"

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary()
  return { title: t.circles.title }
}

export default async function CirclesPage() {
  const { locale, t } = await getDictionary()
  const [circles, members, reviews] = await Promise.all([listCircles(), listMembers(), listReviews()])
  const byId = new Map(members.map((m) => [m.id, m]))

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      {/* Header section with brand hierarchy */}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-violet/20 bg-brand-violet/10 px-3 py-1 text-xs font-semibold text-brand-violet-ink">
            <span className="size-1.5 rounded-full bg-brand-violet" />
            <span>Open Payments & Rafiki Testnet</span>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-brand-navy sm:text-4xl">
            {t.circles.title}
          </h1>
          <p className="mt-2 text-base text-brand-slate max-w-xl">
            {t.circles.lead}
          </p>
        </div>

        <Link
          href={`/${locale}/circles/new`}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-brand-violet px-5 text-sm font-semibold text-brand-white shadow-[0_6px_20px_-8px_var(--color-brand-violet)] transition-[transform,background-color] duration-150 hover:-translate-y-0.5 hover:bg-brand-violet-ink focus-visible:ring-4 focus-visible:ring-brand-violet/30 active:translate-y-0"
        >
          <Plus className="size-4 shrink-0" />
          <span>{t.nav.create}</span>
        </Link>
      </div>

      {circles.length === 0 ? (
        <div className="mt-12 rounded-[32px] border border-dashed border-brand-line bg-brand-white p-12 text-center">
          <p className="text-base text-brand-slate">{t.circles.empty}</p>
          <Link
            href={`/${locale}/circles/new`}
            className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-brand-navy px-5 text-sm font-semibold text-brand-white"
          >
            {t.nav.create}
          </Link>
        </div>
      ) : (
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {circles.map((circle) => {
            const round = currentRound(circle)
            const seatMembers = circle.seats.map((s) => byId.get(s.memberId)).filter((m) => m !== undefined)
            const scores = seatMembers.map((m) => trustFor(m, reviews).score)
            const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
            const open = circle.size - circle.seats.length
            const pot = potFor(circle)
            const potFormatted = formatAmount(amount(pot, circle.contribution), locale)

            return (
              <div
                key={circle.id}
                className="group relative flex flex-col justify-between rounded-[32px] border border-brand-line bg-brand-white p-6 shadow-2xs transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-brand-navy/30 hover:shadow-sm sm:p-7"
              >
                <div>
                  {/* Top Bar: Location & Status */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-slate">
                      <MapPin className="size-3.5 text-brand-slate" aria-hidden="true" />
                      <span>{circle.city}</span>
                      <span className="text-brand-line">•</span>
                      <Calendar className="size-3.5 text-brand-slate" aria-hidden="true" />
                      <span>{circle.roundLengthDays}d {locale === "es" ? "por turno" : "per round"}</span>
                    </div>

                    <div>
                      {circle.status === "OPEN" ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-mint px-3 py-1 text-xs font-semibold text-brand-navy">
                          <span className="size-1.5 rounded-full bg-brand-navy" />
                          <span>{t.circles.status.OPEN}</span>
                        </span>
                      ) : (
                        round && <RoundStatusBadge status={round.status} label={t.circle.states[round.status]} />
                      )}
                    </div>
                  </div>

                  {/* Title and size */}
                  <h2 className="mt-4 text-xl font-semibold tracking-tight text-brand-navy group-hover:text-brand-violet transition-colors">
                    <Link
                      href={`/${locale}/circles/${circle.id}`}
                      className="outline-none focus-visible:underline"
                    >
                      {circle.name}
                    </Link>
                  </h2>

                  {/* Main Metrics: Pot & Contribution */}
                  <div className="mt-5 grid grid-cols-2 gap-4 rounded-2xl bg-brand-canvas p-4 border border-brand-line/60">
                    <div>
                      <p className="text-xs font-medium text-brand-slate flex items-center gap-1">
                        <Coins className="size-3 text-brand-violet" />
                        <span>{t.circle.potLabel}</span>
                      </p>
                      <p className="mt-1 text-xl font-bold tracking-tight text-brand-navy tabular-nums">
                        {potFormatted}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-brand-slate flex items-center gap-1">
                        <Users className="size-3 text-brand-navy" />
                        <span>{t.circles.perRound}</span>
                      </p>
                      <p className="mt-1 text-base font-semibold text-brand-navy tabular-nums">
                        {formatAmount(circle.contribution, locale)}
                      </p>
                    </div>
                  </div>

                  {/* Members silhouettes and progress */}
                  <div className="mt-6">
                    <div className="flex items-center justify-between text-xs text-brand-slate mb-2.5">
                      <span className="font-medium text-brand-navy">
                        {fill(t.circles.members, { count: circle.seats.length })} / {circle.size}
                      </span>
                      {circle.status === "OPEN" ? (
                        <span className="font-medium text-brand-violet-ink">
                          {fill(t.circles.seatsLeft, { count: open })}
                        </span>
                      ) : (
                        <span>
                          {fill(t.circles.round, { round: circle.currentRound, size: circle.size })}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2" aria-hidden="true">
                      {seatMembers.map((m, idx) => {
                        const personIndex = idx % PEOPLE.length
                        const tone = PEOPLE[personIndex]?.tone ?? "navy"
                        return (
                          <div key={m.id} className="relative group/avatar" title={m.name}>
                            <Avatar name={m.name} tone={tone} size="sm" />
                          </div>
                        )
                      })}
                      {Array.from({ length: open }, (_, i) => (
                        <span
                          key={i}
                          title="Cupo disponible"
                          className="size-7.5 rounded-full border border-dashed border-brand-slate/50 bg-brand-white flex items-center justify-center text-[10px] text-brand-slate"
                        >
                          +
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Footer of Card: Trust score + CTA */}
                <div className="mt-6 pt-5 border-t border-brand-line flex items-center justify-between gap-4">
                  <div className="inline-flex items-center gap-1.5 text-xs text-brand-slate">
                    <Shield className="size-3.5 text-brand-violet" />
                    <span>{fill(t.circles.avgTrust, { score: avg })}</span>
                  </div>

                  <Link
                    href={`/${locale}/circles/${circle.id}${circle.status === "OPEN" ? "/join" : ""}`}
                    className={cn(
                      "inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-4 text-xs font-semibold outline-none transition-[transform,background-color] duration-150 active:scale-95",
                      circle.status === "OPEN"
                        ? "bg-brand-navy text-brand-white hover:bg-brand-navy/90"
                        : "border border-brand-line bg-brand-white text-brand-navy hover:border-brand-navy/40",
                    )}
                  >
                    <span>{circle.status === "OPEN" ? t.circles.join : t.circles.view}</span>
                    <ArrowRight className="size-3.5 shrink-0" />
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
