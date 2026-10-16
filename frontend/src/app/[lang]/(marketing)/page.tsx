import type { Metadata } from "next"
import { Benefits } from "@/components/landing/benefits"
import { Faq } from "@/components/landing/faq"
import { FinalCta } from "@/components/landing/final-cta"
import { Hero } from "@/components/landing/hero"
import { HowItWorks } from "@/components/landing/how-it-works"
import { Safety } from "@/components/landing/safety"
import { SavingsCalculator } from "@/components/landing/savings-calculator"
import { UseCases } from "@/components/landing/use-cases"
import { getDictionary } from "@/i18n/get-dictionary"
import { REPO_URL, siteUrl } from "@/lib/site"

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getDictionary()
  const m = t.landing.meta
  return {
    title: { absolute: m.title },
    description: m.description,
    keywords:
      locale === "es"
        ? ["círculos de ahorro", "ahorro en grupo", "ahorro comunitario", "rondas de ahorro", "tandas digitales", "cadenas de ahorro", "ahorro con amigos", "natillera"]
        : ["savings circles", "group savings", "community savings", "ROSCA", "tanda", "save with friends"],
    alternates: {
      canonical: `/${locale}`,
      languages: { es: "/es", en: "/en", "x-default": "/es" },
    },
    openGraph: {
      type: "website",
      url: `/${locale}`,
      siteName: "OpenCircle",
      title: m.title,
      description: m.description,
      locale: locale === "es" ? "es_CO" : "en_US",
      alternateLocale: locale === "es" ? ["en_US"] : ["es_CO"],
    },
    twitter: { card: "summary_large_image", title: m.title, description: m.description },
  }
}

export default async function LandingPage() {
  const { locale, t } = await getDictionary()
  const l = t.landing
  const url = new URL(`/${locale}`, siteUrl).toString()

  // Structured data mirrors visible content only: who we are, the site, and the FAQ shown below.
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${siteUrl.origin}/#org`, name: "OpenCircle", url: siteUrl.origin, sameAs: [REPO_URL] },
      { "@type": "WebSite", "@id": `${siteUrl.origin}/#website`, name: "OpenCircle", url, inLanguage: locale, publisher: { "@id": `${siteUrl.origin}/#org` } },
      {
        "@type": "FAQPage",
        inLanguage: locale,
        mainEntity: l.faq.items.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        // Escape "<" so the JSON can't close the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <Hero t={l.hero} trust={l.trust} locale={locale} />
      <Benefits t={l.benefits} locale={locale} />
      <HowItWorks t={l.how} locale={locale} circleName={l.hero.dashboard.circle} />
      <SavingsCalculator t={l.calc} locale={locale} />
      <Safety t={l.safety} />
      <UseCases t={l.useCases} />
      <Faq t={l.faq} />
      <FinalCta t={l.finalCta} locale={locale} />
    </>
  )
}
