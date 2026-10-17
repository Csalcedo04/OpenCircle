import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { connection } from "next/server"
import { ServiceUnavailable } from "@/components/service-unavailable"
import { fill } from "@/i18n/config"
import { getDictionary } from "@/i18n/get-dictionary"
import { BackendError, getApiCircle, isBackendUnavailable } from "@/lib/api/backend"
import type { ApiCircle } from "@/lib/api/test-clocks"
import { formatAmount } from "@/lib/domain/money"
import { freePayoutRounds, testClocksEnabled } from "@/lib/flows/test-clock"
import { JoinForm } from "../../forms"
import { DevShell, SignInPanel } from "../../view"

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary()
  return { title: t.devClock.joinTitle, robots: { index: false } }
}

export default async function DevCirclePage({ params, searchParams }: PageProps<"/[lang]/dev/circles/[id]">) {
  // Read the flag per request, never baked into a prerendered shell.
  await connection()
  if (!testClocksEnabled()) notFound()
  const { id } = await params
  const inviteParam = (await searchParams).invite
  // A private circle's link carries its invite code.
  const invite = typeof inviteParam === "string" ? inviteParam : undefined
  const { locale, t } = await getDictionary()
  const d = t.devClock
  const path = `/${locale}/dev/circles/${id}${invite ? `?invite=${encodeURIComponent(invite)}` : ""}`

  let circle: ApiCircle
  try {
    circle = await getApiCircle(id, invite)
  } catch (err) {
    if (isBackendUnavailable(err)) return <ServiceUnavailable t={t.common} retryHref={path} />
    if (err instanceof BackendError && err.status === 401) {
      return (
        <DevShell t={d} title={d.joinTitle}>
          <SignInPanel locale={locale} t={d} next={path} />
        </DevShell>
      )
    }
    if (err instanceof BackendError && err.status === 404) notFound()
    throw err
  }
  const free = freePayoutRounds(circle.size, circle.seats)

  return (
    <DevShell t={d} title={circle.name}>
      <p className="text-muted-foreground">
        {circle.city ? `${circle.city}, ` : null}{d.cadences[circle.cadence]}, <span className="tabular-nums">{formatAmount(circle.contribution, locale)}</span>.{" "}
        {fill(d.waiting, { taken: circle.seatsTaken, size: circle.size })}
      </p>

      <section className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-2">
        <div>
          <h2 className="font-heading text-xl font-semibold">{d.seats}</h2>
          <ol className="mt-3 divide-y divide-border border-y border-border">
            {Array.from({ length: circle.size }, (_, i) => i + 1).map((n) => {
              const seat = circle.seats.find((s) => s.payoutRound === n)
              return (
                <li key={n} className="flex justify-between gap-3 py-2.5 text-sm">
                  <span className="text-muted-foreground">{fill(d.period, { number: n, size: circle.size })}</span>
                  <span className="font-medium">{seat?.displayName ?? d.freeSeat}</span>
                </li>
              )
            })}
          </ol>
        </div>
        <div className="rounded-3xl bg-brand-white p-6 ring-1 ring-brand-line sm:p-8">
          <h2 className="font-heading text-xl font-semibold">{d.joinTitle}</h2>
          <div className="mt-5">
            {circle.status === "OPEN" && free.length > 0 ? (
              <JoinForm locale={locale} t={d} circleId={circle.id} rounds={free} invite={invite} />
            ) : (
              <p className="text-muted-foreground">{d.full}</p>
            )}
          </div>
        </div>
      </section>
    </DevShell>
  )
}
