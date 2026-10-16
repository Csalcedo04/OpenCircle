import type { Metadata } from "next"
import { Poppins } from "next/font/google"
import { SiteHeader } from "@/components/site-header"
import { locales } from "@/i18n/config"
import { getDictionary, getLocale } from "@/i18n/get-dictionary"
import "../globals.css"

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }))
}

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary()
  return { title: { default: "OpenCircle", template: "%s · OpenCircle" }, description: t.meta.description }
}

export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  const locale = await getLocale()
  const { t } = await getDictionary()
  return (
    <html lang={locale} className={`${poppins.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-border">
          <p className="mx-auto max-w-6xl px-4 py-8 text-sm text-muted-foreground sm:px-6">{t.common.footer}</p>
        </footer>
      </body>
    </html>
  )
}
