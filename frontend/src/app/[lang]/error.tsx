"use client"

import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import en from "@/i18n/dictionaries/en"
import es from "@/i18n/dictionaries/es"

export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  const { lang } = useParams<{ lang: string }>()
  const t = (lang === "en" ? en : es).common
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="font-heading text-3xl font-semibold">{t.errorTitle}</h1>
      <p className="mt-2 text-muted-foreground">{t.errorBody}</p>
      <Button size="lg" className="mt-6 h-11 px-5 text-base" onClick={() => retry()}>
        {t.retry}
      </Button>
    </div>
  )
}
