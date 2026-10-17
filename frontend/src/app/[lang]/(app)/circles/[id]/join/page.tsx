import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { ArrowLeft } from "lucide-react"
import { KycGate } from "@/components/kyc-gate"
import { fill } from "@/i18n/config"
import { getDictionary } from "@/i18n/get-dictionary"
import { getCircleView } from "@/lib/data"
import { JoinCircleForm } from "./join-circle-form"

export async function generateMetadata({ params }: PageProps<"/[lang]/circles/[id]/join">): Promise<Metadata> {
  const { t } = await getDictionary()
  const view = await getCircleView((await params).id)
  return { title: view ? fill(t.join.title, { circle: view.circle.name }) : "OpenCircle" }
}

export default async function JoinPage({ params, searchParams }: PageProps<"/[lang]/circles/[id]/join">) {
  const { id } = await params
  // A private circle's link carries ?invite=; it's needed to see and join it.
  const { invite } = await searchParams
  const inviteCode = typeof invite === "string" ? invite : undefined
  const { locale, t } = await getDictionary()
  const view = await getCircleView(id, inviteCode)
  if (!view) notFound()
  const { circle } = view

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link href={`/${locale}/circles/${circle.id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {circle.name}
      </Link>
      <h1 className="mt-4 font-heading text-4xl font-semibold tracking-tight">{fill(t.join.title, { circle: circle.name })}</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">{t.join.lead}</p>
      <div className="mt-10">
        <Suspense fallback={<p className="text-muted-foreground">{t.common.loading}</p>}>
          <KycGate locale={locale} t={t.kyc} tc={t.common} returnPath={`/${locale}/circles/${circle.id}/join`}>
            <JoinCircleForm
              locale={locale}
              circle={circle}
              invite={inviteCode}
              t={t.join}
              tErr={t.circleErrors}
              tc={{
                owes: t.circle.owes,
                collateral: t.circle.collateral,
                grant: t.circle.grant,
                uncovered: t.circle.uncovered,
                threshold: t.circle.threshold,
                eligible: t.circle.eligible,
              }}
              notCovered={t.join.notCovered}
            />
          </KycGate>
        </Suspense>
      </div>
    </div>
  )
}
