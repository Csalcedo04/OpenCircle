import type { Metadata } from "next"
import localFont from "next/font/local"
import { SiteHeader } from "@/components/site-header"
import { locales } from "@/i18n/config"
import { getDictionary, getLocale } from "@/i18n/get-dictionary"
import "../globals.css"

// Poppins (OFL) vendored in ../fonts so builds never reach Google Fonts.
const poppins = localFont({
  variable: "--font-poppins",
  display: "swap",
  src: [
    { path: "../fonts/poppins-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/poppins-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/poppins-600.woff2", weight: "600", style: "normal" },
    { path: "../fonts/poppins-700.woff2", weight: "700", style: "normal" },
  ],
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
