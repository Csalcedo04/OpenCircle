import type { ReactNode } from "react"
import { Check, CircleCheck, Send, ShieldCheck } from "lucide-react"
import { fill, type Locale } from "@/i18n/config"
import type { LandingDictionary } from "@/i18n/dictionaries/landing.es"
import { cn } from "@/lib/utils"
import { Avatar, PEOPLE, SectionHeading, pesos } from "./shared"

type T = LandingDictionary["benefits"]

export function Benefits({ t, locale }: { t: T; locale: Locale }) {
  const [pay, turns, feed, rules] = t.cards
  return (
    <section id="beneficios" aria-labelledby="beneficios-title" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading id="beneficios-title" title={t.title} lead={t.lead}>
          <p className="mt-6 inline-flex rounded-full bg-brand-navy px-4 py-2 text-sm font-semibold text-brand-white">{t.kicker}</p>
        </SectionHeading>

        <div className="mt-12 -mx-4 flex gap-4 overflow-x-auto px-4 pb-4 snap-x snap-mandatory scrollbar-none md:mx-0 md:grid md:grid-cols-2 md:gap-4 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-12">
          {pay && (
            <Card className="shrink-0 w-[86vw] sm:w-[70vw] snap-center md:w-auto md:shrink md:snap-align-none lg:col-span-7" title={pay.title} body={pay.body}>
              <PaymentMock t={t.mock} locale={locale} />
            </Card>
          )}
          {turns && (
            <Card className="shrink-0 w-[86vw] sm:w-[70vw] snap-center md:w-auto md:shrink md:snap-align-none lg:col-span-5" title={turns.title} body={turns.body}>
              <TurnsMock t={t.mock} />
            </Card>
          )}
          {feed && (
            <Card className="shrink-0 w-[86vw] sm:w-[70vw] snap-center md:w-auto md:shrink md:snap-align-none lg:col-span-5" title={feed.title} body={feed.body}>
              <FeedMock t={t.mock} locale={locale} />
            </Card>
          )}
          {rules && (
            <Card className="shrink-0 w-[86vw] sm:w-[70vw] snap-center md:w-auto md:shrink md:snap-align-none lg:col-span-7" title={rules.title} body={rules.body}>
              <RulesMock t={t.mock} />
            </Card>
          )}
        </div>
        {/* Mobile App Carousel Indicator */}
        <div className="mt-2 flex justify-center gap-1.5 md:hidden" aria-hidden="true">
          <span className="size-1.5 rounded-full bg-brand-navy" />
          <span className="size-1.5 rounded-full bg-brand-line" />
          <span className="size-1.5 rounded-full bg-brand-line" />
          <span className="size-1.5 rounded-full bg-brand-line" />
        </div>
      </div>
    </section>
  )
}

function Card({ title, body, className, children }: { title: string; body: string; className?: string; children: ReactNode }) {
  return (
    <article className={cn("oc-reveal flex flex-col rounded-[32px] sm:rounded-[36px] border border-brand-line bg-brand-white p-3", className)}>
      <div aria-hidden="true" className="relative grid h-60 place-items-center overflow-hidden rounded-[28px] bg-brand-mist px-5">
        {children}
      </div>
      <div className="px-5 pt-6 pb-5">
        <h3 className="text-xl font-semibold tracking-[-0.02em]">{title}</h3>
        <p className="mt-2 max-w-md leading-relaxed text-brand-slate">{body}</p>
      </div>
    </article>
  )
}

function PaymentMock({ t, locale }: { t: T["mock"]; locale: Locale }) {
  return (
    <div className="w-full max-w-sm">
      <div className="rounded-2xl bg-brand-white p-4 shadow-[0_18px_40px_-24px_color-mix(in_srgb,var(--color-brand-navy)_45%,transparent)]">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-brand-violet text-brand-white">
            <Send className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{t.payTitle}</p>
            <p className="truncate text-xs text-brand-slate">{t.payTo}</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-mint px-2.5 py-1 text-[11px] font-semibold text-brand-navy">
            <Check className="size-3" strokeWidth={3} />
            {t.payDone}
          </span>
        </div>
        <p className="mt-4 text-[2rem] leading-none font-semibold tracking-[-0.03em] tabular-nums">{pesos(20_000, locale)}</p>
        <div className="mt-4 flex items-center justify-between border-t border-dashed border-brand-line pt-3 text-xs text-brand-slate">
          <span>{t.payFrom}</span>
          <span className="flex items-center gap-1.5 font-medium text-brand-navy">
            <Avatar name="María" tone="violet" size="sm" className="size-5 text-[10px]" />
            María
          </span>
        </div>
      </div>
    </div>
  )
}

function TurnsMock({ t }: { t: T["mock"] }) {
  return (
    <ol className="w-full max-w-xs space-y-2">
      {PEOPLE.slice(0, 4).map((p, i) => {
        const done = i === 0
        const now = i === 1
        const you = i === 2
        return (
          <li
            key={p.name}
            className={cn(
              "flex items-center gap-3 rounded-2xl px-3 py-2",
              now ? "bg-brand-navy text-brand-white" : "bg-brand-white",
            )}
          >
            <span className={cn("w-14 text-[11px] font-medium", now ? "text-brand-on-navy" : "text-brand-slate")}>{fill(t.round, { n: i + 1 })}</span>
            <Avatar name={p.name} tone={p.tone} size="sm" />
            <span className="flex-1 text-sm font-semibold">{you ? `${p.name} (${t.you})` : p.name}</span>
            {done && <CircleCheck className="size-4 text-brand-violet-ink" />}
            {now && <span className="rounded-full bg-brand-mint px-2 py-0.5 text-[10px] font-semibold text-brand-navy">{t.now}</span>}
            {you && <span className="rounded-full border border-brand-line px-2 py-0.5 text-[10px] font-semibold">{t.next}</span>}
          </li>
        )
      })}
    </ol>
  )
}

function FeedMock({ t, locale }: { t: T["mock"]; locale: Locale }) {
  const rows = [
    { p: PEOPLE[0], time: "09:41" },
    { p: PEOPLE[3], time: "09:12" },
    { p: PEOPLE[2], time: "08:30" },
  ]
  return (
    <div className="w-full max-w-xs rounded-2xl bg-brand-white p-3 shadow-[0_18px_40px_-26px_color-mix(in_srgb,var(--color-brand-navy)_45%,transparent)]">
      <p className="px-1 pb-2 text-[11px] font-semibold text-brand-slate">{t.feedTitle}</p>
      <ul className="space-y-1">
        {rows.map(({ p, time }, i) => (
          <li key={p.name} className={cn("oc-reveal flex items-center gap-2.5 rounded-xl px-1.5 py-1.5", i === 0 && "bg-brand-mist")}>
            <Avatar name={p.name} tone={p.tone} size="sm" />
            <p className="min-w-0 flex-1 truncate text-[13px]">
              <span className="font-semibold">{p.name}</span> {t.feedPaid}
            </p>
            <p className="text-[13px] font-semibold tabular-nums">{pesos(20_000, locale)}</p>
            <span className="w-9 text-right text-[10px] text-brand-slate tabular-nums">{time}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function RulesMock({ t }: { t: T["mock"] }) {
  const rows = [
    { icon: CircleCheck, label: fill(t.ruleAll, { n: 5 }), done: true },
    { icon: ShieldCheck, label: t.ruleCheck, done: true },
  ]
  return (
    <div className="grid w-full max-w-lg gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
      <ul className="space-y-2">
        {rows.map(({ icon: Icon, label }) => (
          <li key={label} className="flex items-center gap-3 rounded-2xl bg-brand-white px-3.5 py-3 text-sm font-medium">
            <Icon className="size-5 text-brand-violet-ink" />
            {label}
          </li>
        ))}
      </ul>
      <div className="rounded-2xl bg-brand-navy p-4 text-brand-white sm:w-44">
        <span className="grid size-9 place-items-center rounded-full bg-brand-mint">
          <Check className="size-4 text-brand-navy" strokeWidth={3} />
        </span>
        <p className="mt-3 text-sm leading-snug font-semibold">{t.ruleRelease}</p>
      </div>
    </div>
  )
}
