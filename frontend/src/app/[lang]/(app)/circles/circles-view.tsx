"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, ArrowUpRight, Calendar, Coins, Lock, MapPin, Shield, Users } from "lucide-react"
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
  initialTab?: "all" | "my"
}

export function CirclesView({ allCircles, myCircles, locale, t, initialTab = "all" }: Props) {
  const [tab, setTab] = useState<"all" | "my">(initialTab)

  const currentList = tab === "all" ? allCircles : myCircles

  return (
    <div>
      {/* Tab Filter Pills */}
      <div className="mt-8 flex items-center gap-2">
        <div className="inline-flex rounded-full border border-brand-line bg-brand-white p-1 shadow-2xs">
          <button
            type="button"
            onClick={() => setTab("all")}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-all active:scale-95",
              tab === "all"
                ? "bg-brand-navy text-brand-white shadow-2xs"
                : "text-brand-slate hover:text-brand-navy",
            )}
          >
            <span>{t.circles.allTab}</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 font-mono text-[11px] tabular-nums",
                tab === "all" ? "bg-brand-mint text-brand-navy font-bold" : "bg-brand-mist text-brand-navy/70",
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
                : "text-brand-slate hover:text-brand-navy",
            )}
          >
            <span>{t.circles.myTab}</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 font-mono text-[11px] tabular-nums",
                tab === "my" ? "bg-brand-mint text-brand-navy font-bold" : "bg-brand-mist text-brand-navy/70",
              )}
            >
              {myCircles.length}
            </span>
          </button>
        </div>
      </div>

      {/* Grid or Empty State */}
      {currentList.length === 0 ? (
        <div className="mt-8 rounded-[32px] sm:rounded-[40px] border border-dashed border-brand-line bg-brand-white p-12 text-center animate-in fade-in">
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
        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          {currentList.map(({ circle, members: seatMembers, access }) => {
            // Members (the creator included) open their circle; others take or apply for a seat while it's OPEN.
            const wantsSeat = circle.status === "OPEN" && !access.isMember
            const seatLabel = access.visibility === "PUBLIC" ? t.circle.applyCta : t.circles.join
            const round = currentRound(circle)
            const scores = seatMembers.map((m) => trustFor(m).score)
            const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
            const open = circle.size - circle.seats.length
            const pot = potFor(circle)
            const potFormatted = formatAmount(amount(pot, circle.contribution), locale)
            const fillPct =
              circle.size > 0
                ? Math.min(
                    100,
                    Math.round(
                      ((circle.status === "OPEN" ? circle.seats.length : circle.currentRound) * 100) /
                        circle.size,
                    ),
                  )
                : 0

            return (
              <article
                key={circle.id}
                className="group relative flex flex-col justify-between overflow-hidden rounded-[32px] sm:rounded-[36px] border border-brand-line bg-brand-white p-6 shadow-[0_18px_40px_-28px_color-mix(in_srgb,var(--color-brand-navy)_25%,transparent)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-brand-navy/30 hover:shadow-[0_24px_48px_-24px_color-mix(in_srgb,var(--color-brand-navy)_32%,transparent)] sm:p-7"
              >
                <div>
                  {/* Top Bar: Location, Cadence & Status */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="inline-flex flex-wrap items-center gap-1.5 text-xs font-medium text-brand-slate">
                      {circle.city && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-brand-mist px-2.5 py-1 text-[11px] font-semibold text-brand-navy">
                          <MapPin className="size-3 text-brand-violet-ink" aria-hidden="true" />
                          <span>{circle.city}</span>
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand-mist px-2.5 py-1 text-[11px] font-semibold text-brand-navy">
                        <Calendar className="size-3 text-brand-navy/70" aria-hidden="true" />
                        <span>{fill(t.circles.perRoundDuration, { days: circle.roundLengthDays })}</span>
                      </span>
                      {circle.visibility === "PRIVATE" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-brand-violet/12 px-2.5 py-1 text-[11px] font-semibold text-brand-violet-ink">
                          <Lock className="size-2.5" aria-hidden="true" />
                          <span>{t.circles.inviteBadge}</span>
                        </span>
                      ) : null}
                    </div>

                    <div className="shrink-0">
                      {circle.status === "OPEN" ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-mint px-3 py-1 text-[11px] font-bold tracking-wide text-brand-navy">
                          <span className="size-1.5 rounded-full bg-brand-navy" aria-hidden="true" />
                          <span>{t.circles.status.OPEN}</span>
                        </span>
                      ) : (
                        round && <RoundStatusBadge status={round.status} label={t.circle.states[round.status]} />
                      )}
                    </div>
                  </div>

                  {/* Title + Satellite Micro-CTA */}
                  <div className="mt-4 flex items-start justify-between gap-3">
                    <h2 className="text-xl font-semibold tracking-[-0.02em] text-brand-navy sm:text-2xl group-hover:text-brand-violet-ink transition-colors">
                      <Link
                        href={`/${locale}/circles/${circle.id}`}
                        className="outline-none focus-visible:underline"
                      >
                        {circle.name}
                      </Link>
                    </h2>
                    <Link
                      href={`/${locale}/circles/${circle.id}`}
                      aria-label={circle.name}
                      className="grid size-10 shrink-0 place-items-center rounded-full border border-brand-line bg-brand-canvas text-brand-navy shadow-2xs transition-all duration-200 group-hover:scale-105 group-hover:border-brand-navy group-hover:bg-brand-navy group-hover:text-brand-mint"
                    >
                      <ArrowUpRight className="size-4" aria-hidden="true" />
                    </Link>
                  </div>

                  {/* Main Metrics: Contribution in Mist + Pot in Deep Navy with Mint figures (matching HeroDashboard) */}
                  <dl className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-brand-mist p-3.5 sm:p-4">
                      <dt className="flex items-center gap-1.5 text-[11px] font-medium text-brand-navy/70">
                        <Users className="size-3.5 text-brand-navy" aria-hidden="true" />
                        <span>{t.circles.perRound}</span>
                      </dt>
                      <dd className="mt-1.5 text-base font-semibold text-brand-navy tabular-nums sm:text-lg">
                        {formatAmount(circle.contribution, locale)}
                      </dd>
                    </div>
                    <div className="rounded-2xl bg-brand-navy p-3.5 text-brand-white sm:p-4">
                      <dt className="flex items-center gap-1.5 text-[11px] font-medium text-brand-on-navy">
                        <Coins className="size-3.5 text-brand-mint" aria-hidden="true" />
                        <span>{t.circle.potLabel}</span>
                      </dt>
                      <dd className="mt-1.5 text-lg font-semibold tracking-[-0.02em] text-brand-mint tabular-nums sm:text-xl">
                        {potFormatted}
                      </dd>
                    </div>
                  </dl>

                  {/* Gradient Progress Bar + Members silhouettes */}
                  <div className="mt-5">
                    <div className="flex items-baseline justify-between text-xs text-brand-slate">
                      <span className="font-semibold text-brand-navy">
                        {fill(t.circles.members, { count: circle.seats.length })} / {circle.size}
                      </span>
                      {circle.status === "OPEN" ? (
                        <span className="font-semibold text-brand-violet-ink">
                          {fill(t.circles.seatsLeft, { count: open })}
                        </span>
                      ) : (
                        <span className="font-semibold text-brand-navy">
                          {fill(t.circles.round, { round: circle.currentRound, size: circle.size })}
                        </span>
                      )}
                    </div>

                    <div
                      aria-hidden="true"
                      className="mt-2 h-2 overflow-hidden rounded-full bg-brand-mist"
                    >
                      <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-brand-violet),var(--color-brand-mint))] transition-all duration-500 ease-out"
                        style={{ width: `${fillPct}%` }}
                      />
                    </div>

                    <div className="mt-3.5 flex flex-wrap items-center gap-2" aria-hidden="true">
                      {seatMembers.map((m) => (
                        <div key={m.id} className="relative group/avatar" title={m.name}>
                          <MemberAvatar name={m.name} id={m.id} size="sm" />
                        </div>
                      ))}
                      {Array.from({ length: open }, (_, i) => (
                        <span
                          key={i}
                          title={t.circles.openSeatTooltip}
                          className="flex size-7 items-center justify-center rounded-full border border-dashed border-brand-slate/60 bg-brand-canvas text-[10px] font-semibold text-brand-slate"
                        >
                          +
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Footer of Card: Trust score + CTA */}
                <div className="mt-6 flex items-center justify-between gap-4 border-t border-brand-line pt-4">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-canvas px-3 py-1 text-xs font-medium text-brand-navy border border-brand-line/70">
                    <Shield className="size-3.5 text-brand-violet-ink" aria-hidden="true" />
                    <span>{fill(t.circles.avgTrust, { score: avg })}</span>
                  </div>

                  <Link
                    href={`/${locale}/circles/${circle.id}${wantsSeat ? "/join" : ""}`}
                    className={cn(
                      "inline-flex h-10 items-center justify-center gap-1.5 rounded-full px-4.5 text-xs font-semibold outline-none transition-[transform,background-color] duration-150 active:scale-95",
                      wantsSeat
                        ? "bg-brand-violet text-brand-white shadow-[0_6px_18px_-8px_var(--color-brand-violet)] hover:bg-brand-violet-ink"
                        : "bg-brand-navy text-brand-white hover:bg-brand-navy/90",
                    )}
                  >
                    <span>{wantsSeat ? seatLabel : t.circles.view}</span>
                    <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
                  </Link>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
