import { LandingFooter } from "@/components/landing/landing-footer"
import { LandingNav } from "@/components/landing/landing-nav"
import { getDictionary } from "@/i18n/get-dictionary"

export default async function MarketingLayout({ children }: LayoutProps<"/[lang]">) {
  const { locale, t } = await getDictionary()
  return (
    <>
      <LandingNav locale={locale} t={t.landing.nav} />
      <main className="flex-1 overflow-x-clip">{children}</main>
      <LandingFooter t={t.landing.footer} nav={t.landing.nav} locale={locale} />
    </>
  )
}
