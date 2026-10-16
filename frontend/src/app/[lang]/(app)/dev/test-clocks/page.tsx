import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { connection } from "next/server"
import { getDictionary } from "@/i18n/get-dictionary"
import { testClocksEnabled } from "@/lib/flows/test-clock"
import { CreateClockForm } from "../forms"
import { DevShell } from "../view"

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary()
  return { title: t.devClock.title, robots: { index: false } }
}

export default async function TestClocksPage() {
  // Read the flag per request, never baked into a prerendered shell.
  await connection()
  if (!testClocksEnabled()) notFound()
  const { locale, t } = await getDictionary()
  // datetime-local wants "YYYY-MM-DDTHH:mm"; read as UTC by the action.
  const defaultStart = new Date().toISOString().slice(0, 16)
  return (
    <DevShell t={t.devClock} title={t.devClock.title}>
      <p className="max-w-2xl text-muted-foreground">{t.devClock.lead}</p>
      <section className="mt-8 max-w-xl rounded-3xl bg-brand-white p-6 ring-1 ring-brand-line sm:p-8">
        <CreateClockForm locale={locale} t={t.devClock} defaultStart={defaultStart} />
      </section>
    </DevShell>
  )
}
