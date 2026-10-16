import type { Metadata } from "next"
import { LegalPage } from "@/components/landing/legal-page"
import { getDictionary } from "@/i18n/get-dictionary"

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getDictionary()
  return {
    title: t.legal.terms.title,
    description: t.legal.terms.description,
    alternates: { canonical: `/${locale}/terminos`, languages: { es: "/es/terminos", en: "/en/terminos" } },
  }
}

export default async function Page() {
  const { t } = await getDictionary()
  return <LegalPage doc={t.legal.terms} updated={t.legal.updated} contact={t.legal.contact} />
}
