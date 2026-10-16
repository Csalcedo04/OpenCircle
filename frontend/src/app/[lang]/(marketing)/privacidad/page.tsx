import type { Metadata } from "next"
import { LegalPage } from "@/components/landing/legal-page"
import { getDictionary } from "@/i18n/get-dictionary"

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getDictionary()
  return {
    title: t.legal.privacy.title,
    description: t.legal.privacy.description,
    alternates: { canonical: `/${locale}/privacidad`, languages: { es: "/es/privacidad", en: "/en/privacidad" } },
  }
}

export default async function Page() {
  const { t } = await getDictionary()
  return <LegalPage doc={t.legal.privacy} updated={t.legal.updated} contact={t.legal.contact} />
}
