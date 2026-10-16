import { ArrowDown, ArrowUpRight, CheckCircle2, Coins, Globe2, ShieldCheck, Store, Zap } from "lucide-react"
import type { LandingDictionary } from "@/i18n/dictionaries/landing.es"
import { SectionHeading } from "./shared"

export function UseCases({ t }: { t: LandingDictionary["useCases"] }) {
  const [savings, merchant, ilp] = t.cards

  return (
    <section aria-labelledby="soluciones-title" className="py-16 sm:py-24 bg-brand-canvas/60">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <SectionHeading id="soluciones-title" title={t.title} lead={t.lead}>
            <p className="mt-4 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-brand-slate">
              <span className="size-2 rounded-full bg-brand-violet" aria-hidden="true" />
              Arquitectura Multiactivo
            </p>
          </SectionHeading>
          <div className="hidden lg:flex items-center gap-2 rounded-full border border-brand-line bg-brand-white px-4 py-2 text-xs font-semibold text-brand-navy shadow-xs">
            <ShieldCheck className="size-4 text-brand-violet" />
            Protocolo Abierto Interledger (ILP)
          </div>
        </div>

        {/* Asymmetric Bento Architecture (Horizontal Snap on Mobile, Bento on Desktop) */}
        <div className="mt-10 sm:mt-14 -mx-4 flex gap-4 overflow-x-auto px-4 pb-4 snap-x snap-mandatory scrollbar-none md:mx-0 md:grid md:grid-cols-1 md:gap-6 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-12">
          {/* Card 1: Collaborative Savings (7 cols) */}
          {savings && (
            <article className="oc-reveal relative flex flex-col justify-between overflow-hidden rounded-[32px] sm:rounded-[40px] border border-brand-line bg-brand-white p-6 sm:p-9 shadow-xs shrink-0 w-[88vw] sm:w-[75vw] snap-center md:w-auto md:shrink md:snap-align-none lg:col-span-7">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-mist px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-brand-navy/80">
                    <Coins className="size-3.5 text-brand-violet" />
                    {savings.tag}
                  </span>
                  <h3 className="mt-3 text-xl sm:text-2xl lg:text-3xl font-semibold tracking-[-0.02em] text-brand-navy">
                    {savings.title}
                  </h3>
                </div>
                {/* Micro-CTA satellite */}
                <span className="grid size-10 sm:size-11 shrink-0 place-items-center rounded-full border border-brand-line bg-brand-canvas text-brand-navy shadow-xs transition-transform duration-200 hover:scale-105">
                  <ArrowUpRight className="size-4 sm:size-5" />
                </span>
              </div>

              <p className="mt-4 text-sm sm:text-base leading-relaxed text-brand-slate">{savings.body}</p>

              {/* Technical proof preview */}
              <div className="mt-6 sm:mt-8 rounded-[24px] sm:rounded-[28px] border border-brand-line bg-brand-mist/50 p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs font-semibold">
                  <span className="text-brand-navy">Rondas de liquidación rotativa</span>
                  <span className="font-mono text-brand-violet-ink">{savings.metric}</span>
                </div>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 text-center">
                  <div className="rounded-2xl bg-brand-white p-3 shadow-2xs">
                    <p className="text-[10px] uppercase font-bold text-brand-slate">Frecuencia</p>
                    <p className="mt-1 text-xs sm:text-sm font-semibold text-brand-navy">Quincenal</p>
                  </div>
                  <div className="rounded-2xl bg-brand-white p-3 shadow-2xs">
                    <p className="text-[10px] uppercase font-bold text-brand-slate">Custodia</p>
                    <p className="mt-1 text-xs sm:text-sm font-semibold text-brand-navy">Descentralizada</p>
                  </div>
                  <div className="rounded-2xl bg-brand-white p-3 shadow-2xs">
                    <p className="text-[10px] uppercase font-bold text-brand-slate">Garantía</p>
                    <p className="mt-1 text-xs sm:text-sm font-semibold text-brand-navy">GNAP Grant</p>
                  </div>
                </div>
              </div>
            </article>
          )}

          {/* Card 2: Merchant Payouts (5 cols) */}
          {merchant && (
            <article className="oc-reveal relative flex flex-col justify-between overflow-hidden rounded-[32px] sm:rounded-[40px] border border-brand-line bg-brand-white p-6 sm:p-9 shadow-xs shrink-0 w-[88vw] sm:w-[75vw] snap-center md:w-auto md:shrink md:snap-align-none lg:col-span-5">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-mist px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-brand-navy/80">
                    <Store className="size-3.5 text-brand-violet" />
                    {merchant.tag}
                  </span>
                  <h3 className="mt-3 text-xl sm:text-2xl lg:text-3xl font-semibold tracking-[-0.02em] text-brand-navy">
                    {merchant.title}
                  </h3>
                </div>
                <span className="grid size-10 sm:size-11 shrink-0 place-items-center rounded-full border border-brand-line bg-brand-canvas text-brand-navy shadow-xs transition-transform duration-200 hover:scale-105">
                  <ArrowUpRight className="size-4 sm:size-5" />
                </span>
              </div>

              <p className="mt-4 text-sm sm:text-base leading-relaxed text-brand-slate">{merchant.body}</p>

              {/* Live Payment Handle Pill */}
              <div className="mt-6 sm:mt-8 rounded-[24px] sm:rounded-[28px] border border-brand-line bg-brand-navy p-4 sm:p-5 text-brand-white">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] sm:text-[11px] text-brand-on-navy">Incoming Payment URI</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-mint px-2 py-0.5 text-[9px] sm:text-[10px] font-bold text-brand-navy">
                    <Zap className="size-2.5 sm:size-3" />
                    {merchant.metric}
                  </span>
                </div>
                <p className="mt-2 font-mono text-xs sm:text-sm text-brand-mint break-all">
                  $ilp.rafiki.money/creador-tienda
                </p>
                <div className="mt-3 flex items-center justify-between border-t border-brand-white/10 pt-2 text-[10px] sm:text-[11px] text-brand-on-navy">
                  <span>Checkout sin intermediarios</span>
                  <span className="text-brand-white font-semibold">Cero comisiones %</span>
                </div>
              </div>
            </article>
          )}

          {/* Card 3: Interledger Cross-Border STREAM (12 cols) */}
          {ilp && (
            <article className="oc-reveal relative overflow-hidden rounded-[32px] sm:rounded-[40px] border border-brand-line bg-brand-white p-6 sm:p-9 shadow-xs shrink-0 w-[88vw] sm:w-[75vw] snap-center md:w-auto md:shrink md:snap-align-none lg:col-span-12">
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
                <div className="lg:col-span-6 space-y-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-mist px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-brand-navy/80">
                    <Globe2 className="size-3.5 text-brand-violet" />
                    {ilp.tag}
                  </span>
                  <h3 className="text-xl sm:text-2xl lg:text-3xl font-semibold tracking-[-0.02em] text-brand-navy">
                    {ilp.title}
                  </h3>
                  <p className="text-sm sm:text-base leading-relaxed text-brand-slate max-w-xl">{ilp.body}</p>
                  <div className="pt-2 flex flex-col sm:flex-row gap-2 sm:gap-4">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-navy">
                      <CheckCircle2 className="size-4 text-brand-violet shrink-0" />
                      STREAM Paquetes atómicos
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-navy">
                      <CheckCircle2 className="size-4 text-brand-violet shrink-0" />
                      Liquidación multilateral en Rafiki
                    </span>
                  </div>
                </div>

                {/* Interactive Trace Visualization (Responsive mobile vertical, desktop horizontal) */}
                <div className="lg:col-span-6 rounded-[24px] sm:rounded-[32px] border border-brand-line bg-brand-mist/60 p-4 sm:p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs font-mono font-medium text-brand-slate">
                    <span>ILP PACKET ROUTING</span>
                    <span className="text-brand-violet-ink font-semibold">{ilp.metric}</span>
                  </div>

                  <div className="mt-4 sm:mt-5 grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 items-center">
                    <div className="rounded-2xl border border-brand-line bg-brand-white p-3 text-center">
                      <p className="text-[10px] uppercase font-bold text-brand-slate">Origen</p>
                      <p className="mt-1 font-mono text-xs sm:text-sm font-bold text-brand-navy">COP (Pesos)</p>
                      <p className="text-[10px] sm:text-[11px] text-brand-slate font-mono mt-0.5 break-all">$ilp.co/juan</p>
                    </div>

                    <div className="flex flex-col items-center justify-center py-1 sm:py-0">
                      <span className="text-[10px] font-mono font-bold text-brand-violet uppercase">Rafiki Node</span>
                      <div className="hidden sm:block w-full h-0.5 bg-gradient-to-r from-brand-violet to-brand-mint my-1 relative">
                        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-2 rounded-full bg-brand-navy" />
                      </div>
                      <div className="sm:hidden flex items-center justify-center my-1 text-brand-violet">
                        <ArrowDown className="size-4 animate-bounce" />
                      </div>
                      <span className="text-[10px] font-mono text-brand-slate">~180ms</span>
                    </div>

                    <div className="rounded-2xl border border-brand-line bg-brand-white p-3 text-center">
                      <p className="text-[10px] uppercase font-bold text-brand-slate">Destino</p>
                      <p className="mt-1 font-mono text-xs sm:text-sm font-bold text-brand-navy">USD / EUR</p>
                      <p className="text-[10px] sm:text-[11px] text-brand-slate font-mono mt-0.5 break-all">$rafiki.money/maria</p>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          )}
        </div>
        {/* Mobile App Carousel Indicator */}
        <div className="mt-2 flex justify-center gap-1.5 md:hidden" aria-hidden="true">
          <span className="size-1.5 rounded-full bg-brand-navy" />
          <span className="size-1.5 rounded-full bg-brand-line" />
          <span className="size-1.5 rounded-full bg-brand-line" />
        </div>
      </div>
    </section>
  )
}
