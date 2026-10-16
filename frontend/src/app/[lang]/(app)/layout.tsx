import { SiteHeader } from "@/components/site-header"
import { getDictionary } from "@/i18n/get-dictionary"

/** Shell for the demo app (circles, members). The landing has its own nav and footer. */
export default async function AppLayout({ children }: LayoutProps<"/[lang]">) {
  const { t } = await getDictionary()
  return (
    <>
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border">
        <p className="mx-auto max-w-6xl px-4 py-8 text-sm text-muted-foreground sm:px-6">{t.common.footer}</p>
      </footer>
    </>
  )
}
