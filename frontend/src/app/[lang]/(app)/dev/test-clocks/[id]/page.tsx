import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { connection } from "next/server"
import { CircleCheck, CircleDashed, Clock, Lock } from "lucide-react"
import { ServiceUnavailable } from "@/components/service-unavailable"
import { fill } from "@/i18n/config"
import { getDictionary } from "@/i18n/get-dictionary"
import { BackendError, getTestClock, isBackendUnavailable } from "@/lib/api/backend"
import type { TestClock } from "@/lib/api/test-clocks"
import { nextBoundary, testClocksEnabled } from "@/lib/flows/test-clock"
import { cn } from "@/lib/utils"
import { AdvanceButton, ClockCircleForm } from "../../forms"
import { DevShell, SignInPanel, formatDateTime } from "../../view"

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary()
  return { title: t.devClock.title, robots: { index: false } }
}

const statusIcon = { COMPLETED: CircleCheck, PROCESSING: Clock, PENDING: CircleDashed } as const

export default async function TestClockPage({ params }: PageProps<"/[lang]/dev/test-clocks/[id]">) {
  // Read the flag per request, never baked into a prerendered shell.
  await connection()
  if (!testClocksEnabled()) notFound()
  const { id } = await params
  const { locale, t } = await getDictionary()
  const d = t.devClock
  const path = `/${locale}/dev/test-clocks/${id}`

  let clock: TestClock
  try {
    clock = await getTestClock(id)
  } catch (err) {
    if (isBackendUnavailable(err)) return <ServiceUnavailable t={t.common} retryHref={path} />
    if (err instanceof BackendError && err.status === 401) {
      return (
        <DevShell t={d} title={d.title}>
          <SignInPanel locale={locale} t={d} next={path} />
        </DevShell>
      )
    }
    if (err instanceof BackendError && err.status === 404) notFound()
    throw err
  }
  const next = nextBoundary(clock)

  return (
    <DevShell t={d} title={clock.name}>
      <section className="rounded-3xl bg-brand-navy p-6 text-brand-white sm:p-8">
        <p className="text-sm text-brand-on-navy">{d.simulated}</p>
        <p className="mt-1 font-heading text-3xl font-semibold tracking-[-0.03em] tabular-nums sm:text-4xl">{formatDateTime(clock.frozenTime, locale)} UTC</p>
        <p className="mt-2 text-sm text-brand-on-navy">{next ? fill(d.advanceHelp, { date: formatDateTime(next, locale) }) : d.noNext}</p>
      </section>
      <div className="mt-4 flex flex-wrap items-start gap-3">
        {next && <AdvanceButton locale={locale} t={d} clockId={clock.id} to={next} kind="advance" />}
        <AdvanceButton locale={locale} t={d} clockId={clock.id} to={clock.frozenTime} kind="refresh" />
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{d.refreshHelp}</p>

      <h2 className="mt-12 font-heading text-2xl font-semibold">{d.circlesTitle}</h2>
      {clock.circles.length === 0 ? (
        <p className="mt-3 text-muted-foreground">{d.noCircles}</p>
      ) : (
        <ul className="mt-4 space-y-6">
          {clock.circles.map((c) => {
            const p = c.currentPeriod
            const joinPath = `/${locale}/dev/circles/${c.id}`
            return (
              <li key={c.id} className="rounded-3xl bg-brand-white p-6 ring-1 ring-brand-line sm:p-8">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h3 className="font-heading text-xl font-semibold">{c.name}</h3>
                  <span className="rounded-full bg-brand-mist px-3 py-1 text-sm text-brand-navy">{d.cadences[c.cadence]}</span>
                </div>
                {!p ? (
                  <div className="mt-3 space-y-2">
                    <p className="text-muted-foreground">{fill(d.waiting, { taken: c.seatsTaken, size: c.size })}</p>
                    <p className="text-sm">
                      {d.joinLink}:{" "}
                      <Link href={joinPath} className="break-all font-medium text-brand-violet-ink hover:underline">
                        {joinPath}
                      </Link>
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="mt-2 text-muted-foreground">
                      {fill(d.period, { number: p.number, size: c.size })}: {d.periodStates[p.state as keyof typeof d.periodStates] ?? p.state}.{" "}
                      {d.beneficiary}: <span className="font-medium text-foreground">{p.beneficiary.displayName}</span>. {d.deadline}:{" "}
                      <span className="tabular-nums text-foreground">{formatDateTime(p.deadline, locale)}</span>
                    </p>
                    <table className="mt-4 w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-muted-foreground">
                          <th className="py-2 font-medium">{d.member}</th>
                          <th className="py-2 font-medium">{d.status}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {p.contributions.map((m) => {
                          const Icon = statusIcon[m.status as keyof typeof statusIcon] ?? Lock
                          const failure = m.failureCode ? d.failures[m.failureCode as keyof typeof d.failures] : undefined
                          return (
                            <tr key={m.memberId}>
                              <td className="py-2.5">{m.displayName}</td>
                              <td className={cn("py-2.5", m.status === "COMPLETED" && "text-brand-violet-ink")}>
                                <span className="inline-flex items-center gap-1.5">
                                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                                  {d.statuses[m.status as keyof typeof d.statuses] ?? m.status}
                                  {failure ? ` (${failure})` : ""}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <section className="mt-12 rounded-3xl bg-brand-white p-6 ring-1 ring-brand-line sm:p-8">
        <h2 className="font-heading text-2xl font-semibold">{d.newCircle}</h2>
        <div className="mt-6">
          <ClockCircleForm locale={locale} t={d} clockId={clock.id} />
        </div>
      </section>
    </DevShell>
  )
}
