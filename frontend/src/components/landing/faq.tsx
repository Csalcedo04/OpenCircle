import { Plus } from "lucide-react"
import type { LandingDictionary } from "@/i18n/dictionaries/landing.es"

/** Native <details> accordion: keyboard and screen-reader friendly with zero JavaScript. */
export function Faq({ t }: { t: LandingDictionary["faq"] }) {
  return (
    <section id="preguntas-frecuentes" aria-labelledby="faq-title" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16 lg:px-8">
        <h2 id="faq-title" className="text-[2rem] leading-[1.08] font-semibold tracking-[-0.03em] sm:text-5xl lg:sticky lg:top-28 lg:self-start">
          {t.title}
        </h2>
        <div className="divide-y divide-brand-line border-y border-brand-line">
          {t.items.map((item) => (
            <details key={item.q} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 rounded-xl py-5 text-left text-lg font-semibold tracking-[-0.01em] outline-none focus-visible:ring-4 focus-visible:ring-brand-violet/30 [&::-webkit-details-marker]:hidden">
                {item.q}
                <span className="grid size-9 shrink-0 place-items-center rounded-full border border-brand-line transition-[transform,background-color] duration-300 group-open:rotate-45 group-open:bg-brand-navy group-open:text-brand-white motion-reduce:transition-none">
                  <Plus className="size-4" aria-hidden="true" />
                </span>
              </summary>
              <p className="max-w-2xl pr-12 pb-6 leading-relaxed text-brand-slate">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
