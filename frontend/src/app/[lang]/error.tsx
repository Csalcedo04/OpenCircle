"use client"

import { useParams } from "next/navigation"
import { AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import en from "@/i18n/dictionaries/en"
import es from "@/i18n/dictionaries/es"

export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  const { lang } = useParams<{ lang: string }>()
  const t = (lang === "en" ? en : es).common
  return (
    <div className="mx-auto max-w-xl px-4 py-16 sm:py-24">
      <div className="relative isolate overflow-hidden rounded-[32px] border border-brand-line bg-brand-white p-8 text-center shadow-2xs sm:p-10">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-40 select-none">
          <svg viewBox="0 0 600 280" fill="none" className="h-full w-full">
            <circle cx="300" cy="140" r="110" stroke="var(--color-brand-line)" strokeWidth="1.5" strokeDasharray="5 7" />
            <circle cx="300" cy="140" r="175" stroke="color-mix(in srgb, var(--color-brand-violet) 25%, transparent)" strokeWidth="1" />
          </svg>
        </div>
        <span className="mx-auto inline-flex size-12 items-center justify-center rounded-2xl bg-brand-violet/12 text-brand-violet-ink">
          <AlertCircle className="size-6" aria-hidden="true" />
        </span>
        <h1 className="mt-4 font-heading text-2xl font-bold tracking-tight text-brand-navy sm:text-3xl">{t.errorTitle}</h1>
        <p className="mt-2 text-sm leading-relaxed text-brand-slate">{t.errorBody}</p>
        <Button size="lg" className="mt-6 h-11 rounded-full bg-brand-violet px-6 text-sm font-semibold text-brand-white hover:bg-brand-violet-ink" onClick={() => retry()}>
          {t.retry}
        </Button>
      </div>
    </div>
  )
}
