import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Sparkles } from "lucide-react"
import { getDictionary } from "@/i18n/get-dictionary"
import { Suspense } from "react"
import { KycGate } from "@/components/kyc-gate"
import { CreateCircleForm } from "./create-circle-form"

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary()
  return { title: t.create.title }
}

export default async function NewCirclePage() {
  const { locale, t } = await getDictionary()
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href={`/${locale}/circles`}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-slate transition-colors hover:text-brand-navy"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        <span>{t.circles.title}</span>
      </Link>

      <header className="relative isolate mt-4 overflow-hidden rounded-[32px] sm:rounded-[40px] border border-brand-line bg-brand-white p-6 shadow-[0_24px_48px_-28px_color-mix(in_srgb,var(--color-brand-navy)_18%,transparent)] sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-45 select-none">
          <svg viewBox="0 0 1200 320" fill="none" className="h-full w-full">
            <circle cx="1040" cy="110" r="180" stroke="var(--color-brand-line)" strokeWidth="1.5" strokeDasharray="5 7" />
            <circle cx="1040" cy="110" r="275" stroke="color-mix(in srgb, var(--color-brand-violet) 25%, transparent)" strokeWidth="1" />
            <path d="M 560 290 Q 840 30 1180 180" stroke="color-mix(in srgb, var(--color-brand-mint) 65%, transparent)" strokeWidth="2" strokeDasharray="4 6" />
          </svg>
        </div>

        <span className="inline-flex items-center gap-2 rounded-full border border-brand-line bg-brand-canvas px-3 py-1 text-xs font-semibold text-brand-navy">
          <Sparkles className="size-3.5 text-brand-violet" aria-hidden="true" />
          <span>Open Payments · Safe Round Engine</span>
        </span>
        <h1 className="mt-3 font-heading text-3xl font-bold tracking-[-0.03em] text-brand-navy sm:text-5xl">
          {t.create.title}
        </h1>
        <p className="mt-2 max-w-[65ch] text-sm leading-relaxed text-brand-slate sm:text-base">
          {t.create.lead}
        </p>
      </header>

      <div className="mt-8">
        <Suspense fallback={<p className="text-sm text-brand-slate">{t.common.loading}</p>}>
          <KycGate locale={locale} t={t.kyc} tc={t.common} returnPath={`/${locale}/circles/new`}>
            <CreateCircleForm locale={locale} t={t.create} tErr={t.circleErrors} />
          </KycGate>
        </Suspense>
      </div>
    </div>
  )
}
