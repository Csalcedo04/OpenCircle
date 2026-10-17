import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, CheckCircle2, Shield, Wallet } from "lucide-react"
import { RoundStatusBadge } from "@/components/round-status"
import { Stars, TrustDial, formatTenths } from "@/components/trust"
import { fill } from "@/i18n/config"
import { getDictionary } from "@/i18n/get-dictionary"
import { getMember, getMemberFull, listCircles, listMembers } from "@/lib/data"
import { currentRound } from "@/lib/domain/rounds"
import { trustFor } from "@/lib/domain/trust"
import { formatDate } from "@/lib/view"

export async function generateStaticParams() {
  const members = await listMembers()
  return members.map((m) => ({ id: m.id }))
}

export async function generateMetadata({ params }: PageProps<"/[lang]/members/[id]">): Promise<Metadata> {
  const member = await getMember((await params).id)
  return { title: member?.name ?? "OpenCircle" }
}

export default async function MemberPage({ params }: PageProps<"/[lang]/members/[id]">) {
  const { id } = await params
  const { locale, t } = await getDictionary()
  const [profile, members, allCircles] = await Promise.all([
    getMemberFull(id),
    listMembers(),
    listCircles(),
  ])
  if (!profile) notFound()

  const { member, reviews, circles } = profile
  const byId = new Map(members.map((m) => [m.id, m]))
  const circleName = new Map(allCircles.map((c) => [c.id, c.name]))
  const trust = trustFor(member, reviews)
  const received = reviews.filter((r) => r.subjectId === member.id)
  const stats = [
    { label: t.member.onTime, value: member.payments.onTime, color: "text-brand-violet-ink" },
    { label: t.member.late, value: member.payments.late, color: "text-brand-slate" },
    { label: t.member.missed, value: member.payments.missed, color: "text-brand-navy" },
    { label: t.member.circlesCompleted, value: member.circlesCompleted, color: "text-brand-navy" },
  ]

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href={`/${locale}/circles`}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-slate transition-colors hover:text-brand-navy"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        <span>{t.circles.title}</span>
      </Link>

      {/* Header Bento Card */}
      <header className="mt-4 rounded-[32px] border border-brand-line bg-brand-white p-6 shadow-2xs sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <TrustDial trust={trust} label={t.member.trustScore} size="lg" />
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-violet/10 px-3 py-1 text-xs font-semibold text-brand-violet-ink">
              <Shield className="size-3.5" />
              <span>{t.member.trustScore}: {t.member.levels[trust.level]}</span>
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-brand-navy sm:text-4xl">
              {member.name}
            </h1>
            <p className="mt-1 text-xs text-brand-slate">{t.member.scoreHelp}</p>
            <div className="mt-3 flex items-center gap-2 text-xs text-brand-slate">
              <Wallet className="size-3.5 shrink-0 text-brand-violet" />
              <code className="rounded-md bg-brand-canvas px-2 py-0.5 font-mono text-[11px] text-brand-navy break-all border border-brand-line/60">
                {member.walletAddress}
              </code>
              <span>· {fill(t.member.memberSince, { date: formatDate(member.memberSince, locale) })}</span>
            </div>
          </div>
        </div>

        {/* 4 Performance Metric Cards */}
        <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl border border-brand-line/70 bg-brand-canvas p-4 text-center">
              <dt className="text-xs font-medium text-brand-slate">{s.label}</dt>
              <dd className={`mt-1 font-mono text-3xl font-extrabold tracking-tight tabular-nums ${s.color}`}>
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
      </header>

      {/* 2-Column Bento Layout: Reviews & Active Circles */}
      <div className="mt-8 grid gap-8 lg:grid-cols-12 items-start">
        {/* Left Column: Reviews & Peer Testimonials */}
        <section className="rounded-[32px] border border-brand-line bg-brand-white p-6 shadow-2xs sm:p-8 lg:col-span-7">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-brand-line pb-4">
            <h2 className="text-lg font-bold tracking-tight text-brand-navy">{t.member.reviewsTitle}</h2>
            {received.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-brand-slate">
                <Stars rating={Math.round(trust.ratingTenths / 10)} label={fill(t.member.rating, { rating: formatTenths(trust.ratingTenths, locale) })} />
                <span className="font-semibold text-brand-navy">{formatTenths(trust.ratingTenths, locale)}</span>
                <span>({fill(t.member.reviewCount, { count: received.length })})</span>
              </div>
            )}
          </div>

          {received.length === 0 ? (
            <p className="mt-6 text-center text-sm text-brand-slate py-8">{t.circle.noReviews}</p>
          ) : (
            <div className="mt-4 space-y-3">
              {received.map((r) => (
                <div key={r.id} className="rounded-2xl border border-brand-line/70 bg-brand-canvas p-4">
                  <div className="flex items-center justify-between gap-2">
                    <Stars rating={r.rating} label={fill(t.member.rating, { rating: r.rating })} />
                    <span className="text-[11px] text-brand-slate">{formatDate(r.date, locale)}</span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-brand-navy italic">“{r.comment}”</p>
                  <p className="mt-2 text-xs font-medium text-brand-slate">
                    {fill(t.member.by, {
                      name: byId.get(r.authorId)?.name ?? r.authorId,
                      circle: circleName.get(r.circleId) ?? r.circleId,
                    })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Right Column: Circles Participations */}
        <section className="rounded-[32px] border border-brand-line bg-brand-white p-6 shadow-2xs sm:p-8 lg:col-span-5">
          <div className="border-b border-brand-line pb-4">
            <h2 className="text-lg font-bold tracking-tight text-brand-navy">{t.member.circlesTitle}</h2>
          </div>

          <div className="mt-4 space-y-3">
            {circles.map((c) => {
              const round = currentRound(c)
              const seat = c.seats.find((s) => s.memberId === member.id)
              return (
                <div
                  key={c.id}
                  className="rounded-2xl border border-brand-line/70 bg-brand-canvas p-4 transition-colors hover:border-brand-navy/30"
                >
                  <Link
                    href={`/${locale}/circles/${c.id}`}
                    className="text-sm font-semibold text-brand-navy hover:underline block"
                  >
                    {c.name}
                  </Link>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    {seat && (
                      <span className="inline-flex items-center gap-1 text-xs text-brand-slate font-medium">
                        <CheckCircle2 className="size-3 text-brand-violet" />
                        <span>{fill(t.circle.seat, { round: seat.payoutRound })}</span>
                      </span>
                    )}
                    {round ? (
                      <RoundStatusBadge status={round.status} label={t.circle.states[round.status]} />
                    ) : (
                      <span className="rounded-full bg-brand-mint px-2.5 py-0.5 text-xs font-semibold text-brand-navy">
                        {t.circles.status[c.status]}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
