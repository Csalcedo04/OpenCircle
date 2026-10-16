import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { RoundStatusBadge } from "@/components/round-status"
import { Stars, TrustDial, formatTenths } from "@/components/trust"
import { fill } from "@/i18n/config"
import { getDictionary } from "@/i18n/get-dictionary"
import { circlesForMember, getMember, listCircles, listMembers, listReviews } from "@/lib/data"
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
  const [member, members, reviews, circles, allCircles] = await Promise.all([
    getMember(id),
    listMembers(),
    listReviews(),
    circlesForMember(id),
    listCircles(),
  ])
  if (!member) notFound()

  const byId = new Map(members.map((m) => [m.id, m]))
  const circleName = new Map(allCircles.map((c) => [c.id, c.name]))
  const trust = trustFor(member, reviews)
  const received = reviews.filter((r) => r.subjectId === member.id)
  const stats = [
    { label: t.member.onTime, value: member.payments.onTime },
    { label: t.member.late, value: member.payments.late },
    { label: t.member.missed, value: member.payments.missed },
    { label: t.member.circlesCompleted, value: member.circlesCompleted },
  ]

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <TrustDial trust={trust} label={t.member.trustScore} size="lg" />
        <div className="min-w-0">
          <h1 className="font-heading text-4xl font-semibold tracking-tight">{member.name}</h1>
          <p className="mt-1 font-medium text-brand-baltic-blue">
            {t.member.trustScore}: {t.member.levels[trust.level]}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{t.member.scoreHelp}</p>
          <p className="mt-2 text-sm break-all text-muted-foreground">
            {member.walletAddress}. {fill(t.member.memberSince, { date: formatDate(member.memberSince, locale) })}
          </p>
        </div>
      </header>

      <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-brand-white-smoke p-5">
            <dt className="text-sm text-muted-foreground">{s.label}</dt>
            <dd className="mt-1 font-heading text-3xl font-semibold tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-12 grid gap-12 lg:grid-cols-[1.4fr_1fr]">
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-heading text-2xl font-semibold">{t.member.reviewsTitle}</h2>
            {received.length > 0 && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Stars rating={Math.round(trust.ratingTenths / 10)} label={fill(t.member.rating, { rating: formatTenths(trust.ratingTenths, locale) })} />
                {formatTenths(trust.ratingTenths, locale)}, {fill(t.member.reviewCount, { count: received.length })}
              </p>
            )}
          </div>
          {received.length === 0 ? (
            <p className="mt-4 text-muted-foreground">{t.circle.noReviews}</p>
          ) : (
            <ul className="mt-4 divide-y divide-border border-y border-border">
              {received.map((r) => (
                <li key={r.id} className="py-4">
                  <Stars rating={r.rating} label={fill(t.member.rating, { rating: r.rating })} />
                  <p className="mt-2 leading-relaxed">“{r.comment}”</p>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {fill(t.member.by, { name: byId.get(r.authorId)?.name ?? r.authorId, circle: circleName.get(r.circleId) ?? r.circleId })},{" "}
                    {formatDate(r.date, locale)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="font-heading text-2xl font-semibold">{t.member.circlesTitle}</h2>
          <ul className="mt-4 space-y-3">
            {circles.map((c) => {
              const round = currentRound(c)
              const seat = c.seats.find((s) => s.memberId === member.id)
              return (
                <li key={c.id} className="rounded-xl border border-border p-4">
                  <Link href={`/${locale}/circles/${c.id}`} className="font-medium hover:underline">
                    {c.name}
                  </Link>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    {seat && <span>{fill(t.circle.seat, { round: seat.payoutRound })}</span>}
                    {round ? (
                      <RoundStatusBadge status={round.status} label={t.circle.states[round.status]} />
                    ) : (
                      <span className="rounded-full bg-brand-cool-steel/40 px-2.5 py-1 text-xs font-medium text-foreground">{t.circles.status[c.status]}</span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </div>
  )
}
