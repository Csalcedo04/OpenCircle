import { Suspense } from "react"
import { SiteHeader } from "@/components/site-header"
import { AppMobileDock } from "@/components/app-mobile-dock"
import { getDictionary } from "@/i18n/get-dictionary"

/** Shell for the demo app (circles, members). The landing has its own nav and footer. */
export default async function AppLayout({ children }: LayoutProps<"/[lang]">) {
  const { locale, t } = await getDictionary()
  return (
    <div className="flex min-h-screen flex-col bg-brand-canvas text-brand-navy antialiased">
      <SiteHeader />
      <main className="flex-1 pb-32 md:pb-12">{children}</main>
      <footer className="border-t border-brand-line bg-brand-white pb-20 md:pb-0">
        <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-brand-slate sm:px-6">
          <p>{t.common.footer}</p>
        </div>
      </footer>
      <Suspense fallback={null}>
        <AppMobileDock locale={locale} t={t.nav} />
      </Suspense>
    </div>
  )
}

