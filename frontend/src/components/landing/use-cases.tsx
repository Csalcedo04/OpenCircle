import type { LandingDictionary } from "@/i18n/dictionaries/landing.es"
import { cn } from "@/lib/utils"
import { SectionHeading } from "./shared"

/** Each card gets its own quiet palette pairing; the goal ring echoes the circle motif. */
const looks = [
  { card: "bg-brand-mint", ring: "stroke-brand-navy", track: "stroke-brand-navy/15", fill: 72 },
  { card: "bg-[color-mix(in_srgb,var(--color-brand-violet)_14%,var(--color-brand-white))]", ring: "stroke-brand-violet", track: "stroke-brand-violet/20", fill: 45 },
  { card: "bg-brand-mist", ring: "stroke-brand-navy", track: "stroke-brand-navy/10", fill: 28 },
] as const

export function UseCases({ t }: { t: LandingDictionary["useCases"] }) {
  return (
    <section aria-labelledby="metas-title" className="py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading id="metas-title" title={t.title} lead={t.lead} />
        <ul className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
          {t.cards.map((card, i) => {
            const look = looks[i] ?? looks[0]
            return (
              <li key={card.title} className={cn("oc-reveal relative flex min-h-80 flex-col justify-between overflow-hidden rounded-[28px] p-7", look.card)}>
                <div className="relative grid size-28 place-items-center">
                  <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden="true">
                    <circle cx="50" cy="50" r="44" fill="none" strokeWidth="5" className={look.track} />
                    <circle cx="50" cy="50" r="44" fill="none" strokeWidth="5" strokeLinecap="round" pathLength={100} strokeDasharray={`${look.fill} 100`} className={look.ring} />
                  </svg>
                  <span className="text-5xl" aria-hidden="true">
                    {card.emoji}
                  </span>
                </div>
                <div>
                  <h3 className="text-2xl leading-tight font-semibold tracking-[-0.02em]">{card.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-brand-navy/80">{card.body}</p>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
