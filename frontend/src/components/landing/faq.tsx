"use client"

import { useState } from "react"
import { ArrowRight, HelpCircle, Plus } from "lucide-react"
import type { LandingDictionary } from "@/i18n/dictionaries/landing.es"
import { cn } from "@/lib/utils"
import { FaqModal } from "./faq-modal"

type T = LandingDictionary["faq"]
type FaqItem = T["items"][number]

export function Faq({ t }: { t: T }) {
  const [openId, setOpenId] = useState<string | null>(t.items[0]?.id ?? null)
  const [activeModalItem, setActiveModalItem] = useState<FaqItem | null>(null)

  const toggleItem = (id: string) => {
    setOpenId((current) => (current === id ? null : id))
  }

  return (
    <section id="preguntas-frecuentes" aria-labelledby="faq-title" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-16">
          {/* Left Column: Sticky Title & Description (Nu style) */}
          <div className="lg:col-span-5">
            <div className="space-y-4 lg:sticky lg:top-28 lg:self-start">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-mist px-3.5 py-1 text-xs font-semibold text-brand-navy">
                <HelpCircle className="size-3.5 text-brand-violet" />
                {t.modalBadge}
              </span>
              <h2
                id="faq-title"
                className="text-3xl font-semibold tracking-[-0.03em] text-brand-navy sm:text-4xl lg:text-5xl"
              >
                {t.title}
              </h2>
              <p className="max-w-md text-base leading-relaxed text-brand-slate sm:text-lg">
                {t.lead}
              </p>
            </div>
          </div>

          {/* Right Column: Interactive Staggered Cards */}
          <div className="lg:col-span-7">
            <div className="space-y-3.5">
              {t.items.map((item, index) => {
                const isOpen = openId === item.id

                return (
                  <article
                    key={item.id}
                    className="oc-reveal overflow-hidden rounded-[24px] border border-brand-line bg-brand-white transition-all duration-300 hover:border-brand-navy/20 sm:rounded-[32px]"
                    style={{ transitionDelay: `${index * 60}ms` }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleItem(item.id)}
                      aria-expanded={isOpen}
                      aria-controls={`faq-answer-${item.id}`}
                      className="flex w-full cursor-pointer items-center justify-between gap-4 p-5 text-left transition-colors sm:p-6"
                    >
                      <h3 className="text-base font-semibold tracking-[-0.01em] text-brand-navy sm:text-lg">
                        {item.q}
                      </h3>
                      <span
                        aria-hidden="true"
                        className={cn(
                          "grid size-9 shrink-0 place-items-center rounded-full border border-brand-line transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                          isOpen
                            ? "rotate-45 bg-brand-navy text-brand-white shadow-xs"
                            : "bg-brand-canvas text-brand-navy hover:bg-brand-mist",
                        )}
                      >
                        <Plus className="size-4" />
                      </span>
                    </button>

                    {/* Smooth Collapsible Content (CSS Grid 0fr -> 1fr) */}
                    <div
                      id={`faq-answer-${item.id}`}
                      className={cn(
                        "grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                        isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                      )}
                    >
                      <div className="overflow-hidden">
                        <div className="px-5 pb-6 pt-0 sm:px-6">
                          <p className="text-sm leading-relaxed text-brand-slate sm:text-base">
                            {item.a}
                          </p>
                          <div className="mt-4 pt-1">
                            <button
                              type="button"
                              onClick={() => setActiveModalItem(item)}
                              className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-brand-mist px-4 py-2 text-xs font-semibold text-brand-violet-ink transition-colors hover:bg-brand-line focus-visible:ring-2 focus-visible:ring-brand-violet"
                            >
                              <span>{t.exploreAction}</span>
                              <ArrowRight className="size-3.5 text-brand-violet" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Deep-dive Protocol Modal / Mobile Drawer */}
      <FaqModal
        item={activeModalItem}
        onClose={() => setActiveModalItem(null)}
        modalBadge={t.modalBadge}
        modalClose={t.modalClose}
        technicalNoteLabel={t.technicalNoteLabel}
      />
    </section>
  )
}
