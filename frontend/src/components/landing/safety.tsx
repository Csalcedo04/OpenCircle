import { BadgeCheck, Info, ListChecks, ShieldAlert, Wallet } from "lucide-react"
import type { LandingDictionary } from "@/i18n/dictionaries/landing.es"

const icons = [Wallet, BadgeCheck, ListChecks, ShieldAlert] as const

export function Safety({ t }: { t: LandingDictionary["safety"] }) {
  return (
    <section id="seguridad" aria-labelledby="seguridad-title" className="scroll-mt-20 bg-brand-white py-20 sm:py-28">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16 lg:px-8">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <h2 id="seguridad-title" className="text-[2rem] leading-[1.08] font-semibold tracking-[-0.03em] text-balance sm:text-5xl">
            {t.title}
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-pretty text-brand-slate">{t.lead}</p>
          <p className="mt-8 flex gap-2.5 rounded-2xl border border-brand-line bg-brand-canvas p-4 text-sm leading-relaxed text-brand-slate">
            <Info className="mt-0.5 size-4 shrink-0 text-brand-violet-ink" aria-hidden="true" />
            {t.disclaimer}
          </p>
        </div>

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {t.items.map((item, i) => {
            const Icon = icons[i] ?? BadgeCheck
            return (
              <li key={item.title} className="oc-reveal rounded-[24px] border border-brand-line bg-brand-canvas p-6 sm:p-7">
                <span className="grid size-12 place-items-center rounded-2xl bg-brand-navy text-brand-mint">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="mt-6 text-lg font-semibold tracking-[-0.01em]">{item.title}</h3>
                <p className="mt-2 leading-relaxed text-brand-slate">{item.body}</p>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
