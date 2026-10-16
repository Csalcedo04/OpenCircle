import type { Metadata } from "next"
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
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <h1 className="font-heading text-4xl font-semibold tracking-tight">{t.create.title}</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">{t.create.lead}</p>
      <div className="mt-10">
        <Suspense fallback={<p className="text-muted-foreground">{t.common.loading}</p>}>
          <KycGate locale={locale} t={t.kyc} returnPath={`/${locale}/circles/new`}>
            <CreateCircleForm locale={locale} t={t.create} />
          </KycGate>
        </Suspense>
      </div>
    </div>
  )
}
