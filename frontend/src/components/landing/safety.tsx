import { KeyRound, Lock, Repeat, ShieldCheck, Wallet } from "lucide-react"
import type { LandingDictionary } from "@/i18n/dictionaries/landing.es"

const techSpecs = [
  {
    icon: Wallet,
    protocol: "Interledger STREAM",
    detail: "Cero retención de saldos; transferencias punto a punto entre conectores.",
  },
  {
    icon: ShieldCheck,
    protocol: "HMAC SHA-256",
    detail: "Firmas criptográficas en webhooks de Rafiki para marcar COMPLETED.",
  },
  {
    icon: Repeat,
    protocol: "external_id UNIQUE",
    detail: "Deduplicación en audit_events; previene dobles abonos y protege credit_profiles.",
  },
  {
    icon: KeyRound,
    protocol: "Módulos server-only",
    detail: "Aislamiento estricto de claves de firma fuera del alcance del navegador.",
  },
] as const

export function Safety({ t }: { t: LandingDictionary["safety"] }) {
  return (
    <section id="seguridad" aria-labelledby="seguridad-title" className="scroll-mt-20 bg-brand-white py-20 sm:py-28">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16 lg:px-8">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand-slate">
            <span className="size-2 rounded-full bg-brand-violet" aria-hidden="true" />
            Auditoría & Criptografía
          </p>
          <h2 id="seguridad-title" className="mt-3 text-[2rem] leading-[1.08] font-semibold tracking-[-0.03em] text-balance text-brand-navy sm:text-5xl">
            {t.title}
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-pretty text-brand-slate">{t.lead}</p>
          
          <div className="mt-8 rounded-[28px] border border-brand-line bg-brand-canvas p-5">
            <div className="flex items-center gap-2 text-xs font-semibold text-brand-navy">
              <Lock className="size-4 text-brand-violet" />
              Contrato de Seguridad Inmutable
            </div>
            <p className="mt-2 text-xs leading-relaxed text-brand-slate">
              {t.disclaimer}
            </p>
          </div>
        </div>

        <div className="flex flex-col">
          <ul className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-4 snap-x snap-mandatory scrollbar-none sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:px-0 sm:pb-0">
            {t.items.map((item, i) => {
              const spec = techSpecs[i] ?? techSpecs[0]
              const Icon = spec.icon
              return (
                <li
                  key={item.title}
                  className="oc-reveal relative flex flex-col justify-between rounded-[32px] sm:rounded-[36px] border border-brand-line bg-brand-canvas p-6 sm:p-7 shadow-2xs transition-shadow duration-200 hover:shadow-xs shrink-0 w-[84vw] snap-center sm:w-auto sm:shrink sm:snap-align-none"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="grid size-12 place-items-center rounded-2xl bg-brand-navy text-brand-mint shadow-2xs">
                        <Icon className="size-5" aria-hidden="true" />
                      </span>
                      <span className="rounded-full bg-brand-white border border-brand-line px-2.5 py-1 font-mono text-[10px] font-semibold text-brand-slate">
                        {spec.protocol}
                      </span>
                    </div>
                    <h3 className="mt-6 text-xl font-semibold tracking-[-0.01em] text-brand-navy">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-brand-slate">{item.body}</p>
                  </div>

                  <div className="mt-6 border-t border-brand-line/60 pt-3">
                    <p className="text-[11px] font-mono text-brand-slate leading-tight">{spec.detail}</p>
                  </div>
                </li>
              )
            })}
          </ul>
          {/* Mobile App Carousel Indicator */}
          <div className="mt-2 flex justify-center gap-1.5 sm:hidden" aria-hidden="true">
            <span className="size-1.5 rounded-full bg-brand-navy" />
            <span className="size-1.5 rounded-full bg-brand-line" />
            <span className="size-1.5 rounded-full bg-brand-line" />
            <span className="size-1.5 rounded-full bg-brand-line" />
          </div>
        </div>
      </div>
    </section>
  )
}
