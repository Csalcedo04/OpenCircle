import type { Metadata } from "next"
import Link from "next/link"
import { Plus } from "lucide-react"
import { getDictionary } from "@/i18n/get-dictionary"
import { listCircleViews, listMyCircleViews } from "@/lib/data"
import { CirclesView } from "./circles-view"

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary()
  return { title: t.circles.title }
}

export default async function CirclesPage() {
  const { locale, t } = await getDictionary()
  const [listed, mine] = await Promise.all([listCircleViews(), listMyCircleViews()])

  // The list is the public circles; the viewer's own private circles belong in it too.
  const listedIds = new Set(listed.map((v) => v.circle.id))
  const all = [...listed, ...mine.filter((v) => !listedIds.has(v.circle.id))]

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      {/* Header section with brand hierarchy */}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-violet/20 bg-brand-violet/10 px-3 py-1 text-xs font-semibold text-brand-violet-ink">
            <span className="size-1.5 rounded-full bg-brand-violet" />
            <span>Open Payments & Rafiki Testnet</span>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-brand-navy sm:text-4xl">
            {t.circles.title}
          </h1>
          <p className="mt-2 text-base text-brand-slate max-w-xl">
            {t.circles.lead}
          </p>
        </div>

        <Link
          href={`/${locale}/circles/new`}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-brand-violet px-5 text-sm font-semibold text-brand-white shadow-[0_6px_20px_-8px_var(--color-brand-violet)] transition-[transform,background-color] duration-150 hover:-translate-y-0.5 hover:bg-brand-violet-ink focus-visible:ring-4 focus-visible:ring-brand-violet/30 active:translate-y-0"
        >
          <Plus className="size-4 shrink-0" />
          <span>{t.nav.create}</span>
        </Link>
      </div>

      <CirclesView allCircles={all} myCircles={mine} locale={locale} t={t} />
    </div>
  )
}
