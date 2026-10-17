"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, Calendar, Coins, Lock, MapPin, Shield, Users } from "lucide-react"
import { RoundStatusBadge } from "@/components/round-status"
import { MemberAvatar } from "@/components/member-avatar"
import { fill, type Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import { amount, formatAmount } from "@/lib/domain/money"
import { currentRound, potFor } from "@/lib/domain/rounds"
import { trustFor } from "@/lib/domain/trust"
import type { CircleView } from "@/lib/data"
import { cn } from "@/lib/utils"

interface Props {
  /** Each circle with its members, so the card shows the seats' trust. */
  allCircles: CircleView[]
  myCircles: CircleView[]
  locale: Locale
  t: Dictionary
}

export function CirclesView({ allCircles, myCircles, locale, t }: Props) {
  const [tab, setTab] = useState<"all" | "my">("all")

  const currentList = tab === "all" ? allCircles : myCircles

  return (
    <div>
      {/* Tab Filter Pills */}
      <div className="mt-8 flex items-center gap-2 border-b border-brand-line pb-4">
        <button
          type="button"
          onClick={() => setTab("all")}
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-all active:scale-95",
            tab === "all"
              ? "bg-brand-navy text-brand-white shadow-2xs"
              : "bg-brand-canvas text-brand-slate hover:text-brand-navy hover:bg-brand-line/50",
          )}
        >
          <span>{t.circles.allTab}</span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-mono",
              tab === "all" ? "bg-brand-white/20 text-brand-white" : "bg-brand-line text-brand-slate",
            )}
          >
            {allCircles.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTab("my")}
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-all active:scale-95",
            tab === "my"
              ? "bg-brand-navy text-brand-white shadow-2xs"
              : "bg-brand-canvas text-brand-slate hover:text-brand-navy hover:bg-brand-line/50",
          )}
        >
          <span>{t.circles.myTab}</span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-mono",
              tab === "my" ? "bg-brand-white/20 text-brand-white" : "bg-brand-line text-brand-slate",
            )}
          >
            {myCircles.length}
          </span>
        </button>
      </div>

      {/* Grid or Empty State */}
      {currentList.length === 0 ? (
        <div className="mt-12 rounded-[32px] border border-dashed border-brand-line bg-brand-white p-12 text-center animate-in fade-in">
          <p className="text-base font-medium text-brand-navy">
            {tab === "my" ? t.circles.myEmpty : t.circles.empty}
          </p>
          <div className="mt-5 flex items-center justify-center gap-3">
            {tab === "my" && allCircles.length > 0 && (
              <button
                type="button"
                onClick={() => setTab("all")}
                className="inline-flex h-10 items-center justify-center rounded-full border border-brand-line bg-brand-white px-5 text-sm font-semibold text-brand-navy hover:bg-brand-canvas transition-colors"
              >
                {t.circles.allTab}
              </button>
            )}
            <Link
              href={`/${locale}/circles/new`}
              className="inline-flex h-10 items-center justify-center rounded-full bg-brand-violet px-5 text-sm font-semibold text-brand-white hover:bg-brand-violet-ink transition-colors"
            >
              {t.nav.create}
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
          {currentList.map(({ circle, members: seatMembers }) => {
            const round = currentRound(circle)
            const scores = seatMembers.map((m) => trustFor(m).score)
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
                  {/* Top Bar: Location, Cadence & Status */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="inline-flex flex-wrap items-center gap-1.5 text-xs font-medium text-brand-slate">
                      {circle.city && (
                        <>
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="size-3.5 text-brand-slate" aria-hidden="true" />
                            <span>{circle.city}</span>
                          </span>
                          <span className="text-brand-line">•</span>
                        </>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="size-3.5 text-brand-slate" aria-hidden="true" />
                        <span>{fill(t.circles.perRoundDuration, { days: circle.roundLengthDays })}</span>
                      </span>
                      {circle.visibility === "PRIVATE" ? (
                        <>
                          <span className="text-brand-line">•</span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-brand-violet/10 px-2 py-0.5 text-[11px] font-semibold text-brand-violet">
                            <Lock className="size-2.5" />
                            <span>{t.circles.inviteBadge}</span>
                          </span>
                        </>
                      ) : null}
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
                      {seatMembers.map((m) => (
                        <div key={m.id} className="relative group/avatar" title={m.name}>
                          <MemberAvatar name={m.name} id={m.id} size="sm" />
                        </div>
                      ))}
                      {Array.from({ length: open }, (_, i) => (
                        <span
                          key={i}
                          title={t.circles.openSeatTooltip}
                          className="size-7 rounded-full border border-dashed border-brand-slate/50 bg-brand-white flex items-center justify-center text-[10px] text-brand-slate"
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
