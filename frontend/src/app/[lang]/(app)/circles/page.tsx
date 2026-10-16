import type { Metadata } from "next"
import Link from "next/link"
import { RoundStatusBadge } from "@/components/round-status"
import { initials } from "@/components/trust"
import { buttonVariants } from "@/components/ui/button"
import { fill } from "@/i18n/config"
import { getDictionary } from "@/i18n/get-dictionary"
import { listCircles, listMembers, listReviews } from "@/lib/data"
import { formatAmount } from "@/lib/domain/money"
import { currentRound } from "@/lib/domain/rounds"
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
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-4xl font-semibold tracking-tight">{t.circles.title}</h1>
          <p className="mt-2 text-muted-foreground">{t.circles.lead}</p>
        </div>
        <Link href={`/${locale}/circles/new`} className={cn(buttonVariants({ size: "lg" }), "h-10 px-4")}>
          {t.nav.create}
        </Link>
      </div>

      {circles.length === 0 ? (
        <p className="mt-12 text-muted-foreground">{t.circles.empty}</p>
      ) : (
        <ul className="mt-10 divide-y divide-border border-y border-border">
          {circles.map((circle) => {
            const round = currentRound(circle)
            const seatMembers = circle.seats.map((s) => byId.get(s.memberId)).filter((m) => m !== undefined)
            const scores = seatMembers.map((m) => trustFor(m, reviews).score)
            const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
            const open = circle.size - circle.seats.length
            return (
              <li key={circle.id} className="grid gap-4 py-6 md:grid-cols-[1.4fr_1fr_1fr_auto] md:items-center">
                <div>
                  <h2 className="font-heading text-xl font-semibold">
                    <Link href={`/${locale}/circles/${circle.id}`} className="outline-none hover:underline focus-visible:underline">
                      {circle.name}
                    </Link>
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {circle.city}, {fill(t.circles.members, { count: circle.size })}
                  </p>
                  <div className="mt-3 flex -space-x-2" aria-hidden="true">
                    {seatMembers.map((m) => (
                      <span
                        key={m.id}
                        className="grid size-8 place-items-center rounded-full border-2 border-brand-white bg-brand-violet text-xs font-semibold text-brand-white"
                      >
                        {initials(m.name)}
                      </span>
                    ))}
                    {Array.from({ length: open }, (_, i) => (
                      <span key={i} className="size-8 rounded-full border-2 border-dashed border-brand-slate bg-brand-white" />
                    ))}
                  </div>
                </div>

                <p>
                  <span className="font-heading text-2xl font-semibold tabular-nums">{formatAmount(circle.contribution, locale)}</span>
                  <span className="ml-1.5 text-sm text-muted-foreground">{t.circles.perRound}</span>
                </p>

                <div className="flex flex-col items-start gap-1.5 text-sm">
                  {circle.status === "OPEN" ? (
                    <>
                      <span className="rounded-full bg-brand-mint px-2.5 py-1 text-xs font-medium">{t.circles.status.OPEN}</span>
                      <span className="text-muted-foreground">{fill(t.circles.seatsLeft, { count: open })}</span>
                    </>
                  ) : (
                    <>
                      {round && <RoundStatusBadge status={round.status} label={t.circle.states[round.status]} />}
                      <span className="text-muted-foreground">{fill(t.circles.round, { round: circle.currentRound, size: circle.size })}</span>
                    </>
                  )}
                  <span className="text-muted-foreground">{fill(t.circles.avgTrust, { score: avg })}</span>
                </div>

                <Link
                  href={`/${locale}/circles/${circle.id}${circle.status === "OPEN" ? "/join" : ""}`}
                  className={cn(buttonVariants({ variant: circle.status === "OPEN" ? "default" : "outline" }), "h-9 px-4")}
                >
                  {circle.status === "OPEN" ? t.circles.join : t.circles.view}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
