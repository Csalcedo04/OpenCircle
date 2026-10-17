import type { Metadata } from "next"
import Link from "next/link"
import { Plus } from "lucide-react"
import { ServiceUnavailable } from "@/components/service-unavailable"
import { getDictionary } from "@/i18n/get-dictionary"
import { isBackendUnavailable } from "@/lib/api/backend"
import { listCircleViews, listMyCircleViews } from "@/lib/data"
import { CirclesView } from "./circles-view"

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary()
  return { title: t.circles.title }
}

export default async function CirclesPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>
}) {
  const [{ locale, t }, query] = await Promise.all([
    getDictionary(),
    searchParams ?? Promise.resolve({ tab: undefined }),
  ])
  const initialTab = query.tab === "my" ? "my" : "all"

  let listed, mine
  try {
    ;[listed, mine] = await Promise.all([listCircleViews(), listMyCircleViews()])
  } catch (err) {
    if (isBackendUnavailable(err)) {
      return (
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
          <ServiceUnavailable t={t.common} retryHref={`/${locale}/circles`} />
        </div>
      )
    }
    throw err
  }

  // The list is the public circles; the viewer's own private circles belong in it too.
  const listedIds = new Set(listed.map((v) => v.circle.id))
  const all = [...listed, ...mine.filter((v) => !listedIds.has(v.circle.id))]

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      {/* Editorial Hero Bento with Orbital Constellation SVG */}
      <div className="relative isolate overflow-hidden rounded-[32px] sm:rounded-[40px] border border-brand-line bg-brand-white p-6 sm:p-9 shadow-[0_24px_48px_-28px_color-mix(in_srgb,var(--color-brand-navy)_22%,transparent)]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-45 select-none"
        >
          <svg viewBox="0 0 1200 320" fill="none" className="h-full w-full">
            <circle cx="1020" cy="120" r="190" stroke="var(--color-brand-line)" strokeWidth="1.5" strokeDasharray="5 7" />
            <circle cx="1020" cy="120" r="290" stroke="color-mix(in srgb, var(--color-brand-violet) 25%, transparent)" strokeWidth="1" />
            <path d="M 520 290 Q 820 40 1180 200" stroke="color-mix(in srgb, var(--color-brand-mint) 65%, transparent)" strokeWidth="2" strokeDasharray="4 6" />
          </svg>
        </div>

        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-line bg-brand-canvas px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-brand-navy shadow-2xs">
              <span className="size-2 rounded-full bg-brand-violet oc-pulse" aria-hidden="true" />
              <span>Open Payments · Rafiki ILP</span>
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-brand-navy sm:text-5xl">
              {t.circles.title}
            </h1>
            <p className="mt-2.5 max-w-xl text-base leading-relaxed text-brand-slate sm:text-lg">
              {t.circles.lead}
            </p>
          </div>

          <Link
            href={`/${locale}/circles/new`}
            className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-brand-violet px-6 text-sm font-semibold text-brand-white shadow-[0_8px_24px_-10px_var(--color-brand-violet)] transition-[transform,background-color] duration-150 hover:-translate-y-0.5 hover:bg-brand-violet-ink focus-visible:ring-4 focus-visible:ring-brand-violet/30 active:translate-y-0"
          >
            <Plus className="size-4 shrink-0" />
            <span>{t.nav.create}</span>
          </Link>
        </div>
      </div>

      <CirclesView
        key={initialTab}
        allCircles={all}
        myCircles={mine}
        locale={locale}
        t={t}
        initialTab={initialTab}
      />
    </div>
  )
}
