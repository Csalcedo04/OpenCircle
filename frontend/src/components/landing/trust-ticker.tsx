import { Check } from "lucide-react"
import type { LandingDictionary } from "@/i18n/dictionaries/landing.es"

export function TrustTicker({ trust }: { trust: LandingDictionary["trust"] }) {
  // We duplicate items so the loop covers wide screens and loops seamlessly without gap
  const repeated = [...trust, ...trust]

  return (
    <div
      aria-label="Garantías del protocolo"
      className="relative w-full border-y border-brand-line bg-brand-white/80 py-3.5 backdrop-blur-xs sm:py-4.5 overflow-hidden"
    >
      <div className="oc-ticker-mask w-full overflow-hidden">
        <div className="oc-ticker-track flex items-center gap-6 sm:gap-10">
          {/* Primary accessible list */}
          <ul role="list" className="flex shrink-0 items-center gap-6 sm:gap-10">
            {repeated.map((item, index) => (
              <li
                key={`primary-${index}-${item}`}
                className="inline-flex shrink-0 items-center gap-2.5 rounded-full border border-brand-line/80 bg-brand-canvas/70 px-4 py-2 sm:px-5 sm:py-2.5 text-xs sm:text-[14px] lg:text-[15px] font-medium text-brand-navy shadow-2xs select-none transition-colors hover:border-brand-violet/30 hover:bg-brand-white"
              >
                <span className="grid size-5 sm:size-6 place-items-center rounded-full bg-brand-mint shrink-0 shadow-2xs">
                  <Check className="size-3 sm:size-3.5 text-brand-navy" strokeWidth={3} aria-hidden="true" />
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>

          {/* Cloned list for seamless infinite loop (hidden from assistive technologies) */}
          <ul role="presentation" aria-hidden="true" className="flex shrink-0 items-center gap-6 sm:gap-10">
            {repeated.map((item, index) => (
              <li
                key={`clone-${index}-${item}`}
                className="inline-flex shrink-0 items-center gap-2.5 rounded-full border border-brand-line/80 bg-brand-canvas/70 px-4 py-2 sm:px-5 sm:py-2.5 text-xs sm:text-[14px] lg:text-[15px] font-medium text-brand-navy shadow-2xs select-none transition-colors hover:border-brand-violet/30 hover:bg-brand-white"
              >
                <span className="grid size-5 sm:size-6 place-items-center rounded-full bg-brand-mint shrink-0 shadow-2xs">
                  <Check className="size-3 sm:size-3.5 text-brand-navy" strokeWidth={3} aria-hidden="true" />
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
