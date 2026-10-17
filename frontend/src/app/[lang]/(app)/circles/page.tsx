import type { Metadata } from "next"
import Link from "next/link"
import { Plus } from "lucide-react"
import { getDictionary } from "@/i18n/get-dictionary"
import { listCircles, listMembers, listMyCircles, listReviews } from "@/lib/data"
import { getMyProfile } from "@/lib/api/backend"
import { CirclesView } from "./circles-view"

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary()
  return { title: t.circles.title }
}

export default async function CirclesPage() {
  const { locale, t } = await getDictionary()
  const [circles, myCirclesList, members, reviews, myProfile] = await Promise.all([
    listCircles(),
    listMyCircles(),
    listMembers(),
    listReviews(),
    getMyProfile().catch(() => null),
  ])

  // If user is authenticated, use their real circles from the backend; if guest visitor, fallback to demo circle
  const myCircles = myProfile
    ? myCirclesList
    : circles.slice(0, 1)

  // Ensure any circle the user belongs to (even private ones) is visible to them
  const existingIds = new Set(circles.map((c) => c.id))
  const allCircles = [
    ...circles,
    ...myCircles.filter((c) => !existingIds.has(c.id)),
  ]

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

      <CirclesView
        allCircles={allCircles}
        myCircles={myCircles}
        locale={locale}
        t={t}
        members={members}
        reviews={reviews}
      />
    </div>
  )
}
