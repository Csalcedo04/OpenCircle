import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { fill } from "@/i18n/config"
import { getDictionary } from "@/i18n/get-dictionary"
import { getCircle, listCircles } from "@/lib/data"
import { JoinCircleForm } from "./join-circle-form"

export async function generateStaticParams() {
  const circles = await listCircles()
  return circles.map((c) => ({ id: c.id }))
}

export async function generateMetadata({ params }: PageProps<"/[lang]/circles/[id]/join">): Promise<Metadata> {
  const { t } = await getDictionary()
  const circle = await getCircle((await params).id)
  return { title: circle ? fill(t.join.title, { circle: circle.name }) : "OpenCircle" }
}

export default async function JoinPage({ params }: PageProps<"/[lang]/circles/[id]/join">) {
  const { id } = await params
  const { locale, t } = await getDictionary()
  const circle = await getCircle(id)
  if (!circle) notFound()

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link href={`/${locale}/circles/${circle.id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {circle.name}
      </Link>
      <h1 className="mt-4 font-heading text-4xl font-semibold tracking-tight">{fill(t.join.title, { circle: circle.name })}</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">{t.join.lead}</p>
      <div className="mt-10">
        <JoinCircleForm
          locale={locale}
          circle={circle}
          t={t.join}
          tc={{
            owes: t.circle.owes,
            collateral: t.circle.collateral,
            grant: t.circle.grant,
            uncovered: t.circle.uncovered,
            threshold: t.circle.threshold,
            eligible: t.circle.eligible,
            seat: t.circle.seat,
          }}
          notCovered={t.join.notCovered}
        />
      </div>
    </div>
  )
}
