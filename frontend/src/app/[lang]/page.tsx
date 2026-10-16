import Link from "next/link"
import { Eye, Lock, Sparkles, Star, Wallet } from "lucide-react"
import { CircleRing } from "@/components/circle-ring"
import { buttonVariants } from "@/components/ui/button"
import { fill } from "@/i18n/config"
import { getDictionary } from "@/i18n/get-dictionary"
import { getCircle, listMembers } from "@/lib/data"
import { formatAmount, percent } from "@/lib/domain/money"
import { amount } from "@/lib/domain/money"
import { collectedFor, currentRound, potFor, verifiedCount } from "@/lib/domain/rounds"
import { cn } from "@/lib/utils"
import { ringSeats } from "@/lib/view"

const trustIcons = [Wallet, Eye, Lock, Star] as const

export default async function Home() {
  const { locale, t } = await getDictionary()
  const [circle, members] = await Promise.all([getCircle("parceros-envigado"), listMembers()])
  const byId = new Map(members.map((m) => [m.id, m]))
  const round = circle ? currentRound(circle) : undefined

  return (
    <>
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.1fr_1fr] md:py-20">
        <div className="max-w-xl">
          <h1 className="font-heading text-4xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            {t.home.title}
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">{t.home.lead}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={`/${locale}/circles`} className={cn(buttonVariants({ size: "lg" }), "h-11 px-5 text-base")}>
              {t.home.explore}
            </Link>
            <Link
              href={`/${locale}/circles/new`}
              className={cn(buttonVariants({ size: "lg", variant: "outline" }), "h-11 border-brand-deep-space-blue px-5 text-base")}
            >
              {t.home.start}
            </Link>
          </div>
        </div>

        {circle && round && (
          <figure className="mx-auto w-full max-w-md">
            <CircleRing
              seats={ringSeats(circle, round, byId)}
              progress={percent(collectedFor(circle, round), potFor(circle))}
              amount={formatAmount(amount(collectedFor(circle, round), circle.contribution), locale)}
              caption={`/ ${formatAmount(amount(potFor(circle), circle.contribution), locale)}`}
              title={circle.name}
            />
            <figcaption className="mt-2 text-center text-sm text-muted-foreground">
              <Link href={`/${locale}/circles/${circle.id}`} className="underline-offset-4 hover:underline">
                {fill(t.home.ringCaption, {
                  circle: circle.name,
                  round: round.number,
                  size: circle.size,
                  verified: verifiedCount(round),
                })}
              </Link>
            </figcaption>
          </figure>
        )}
      </section>

      <section className="border-y border-border bg-muted">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="font-heading text-3xl font-semibold tracking-tight">{t.home.howTitle}</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">{t.home.howLead}</p>
          <ol className="mt-10 grid gap-8 md:grid-cols-5 md:gap-5">
            {t.home.steps.map((step, i) => (
              <li key={step.title} className="relative md:pt-12">
                <span
                  aria-hidden="true"
                  className={cn(
                    "mb-3 grid size-9 place-items-center rounded-full border-2 border-brand-baltic-blue font-heading text-sm font-semibold md:absolute md:top-0 md:left-0 md:mb-0",
                    i === t.home.steps.length - 1 ? "border-dashed" : "bg-brand-baltic-blue text-brand-white-smoke",
                  )}
                >
                  {i + 1}
                </span>
                {i < t.home.steps.length - 2 && (
                  <span aria-hidden="true" className="absolute top-[18px] right-0 left-11 hidden h-0.5 bg-brand-cool-steel md:block" />
                )}
                <h3 className="font-heading text-lg font-semibold">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="max-w-2xl font-heading text-3xl font-semibold tracking-tight">{t.home.trustTitle}</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">{t.home.trustLead}</p>
        <ul className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {t.home.trust.map((item, i) => {
            const Icon = trustIcons[i] ?? Star
            return (
              <li key={item.title} className="flex gap-4 border-t-2 border-brand-deep-space-blue pt-5">
                <Icon className="mt-0.5 size-6 shrink-0 text-brand-baltic-blue" aria-hidden="true" />
                <div>
                  <h3 className="font-heading text-lg font-semibold">{item.title}</h3>
                  <p className="mt-1 leading-relaxed text-muted-foreground">{item.body}</p>
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <aside className="flex flex-col gap-4 rounded-2xl bg-brand-deep-space-blue p-6 text-brand-white-smoke sm:flex-row sm:items-center sm:p-8">
          <Sparkles className="size-8 shrink-0 text-brand-cool-steel" aria-hidden="true" />
          <div className="flex-1">
            <h2 className="font-heading text-xl font-semibold">{t.home.yieldTitle}</h2>
            <p className="mt-1 max-w-2xl text-brand-cool-steel">{t.home.yieldBody}</p>
          </div>
          <span className="self-start rounded-full border border-brand-cool-steel px-3 py-1 text-xs font-medium sm:self-center">
            {t.home.soon}
          </span>
        </aside>
      </section>
    </>
  )
}
