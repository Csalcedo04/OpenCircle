import type { Metadata, Viewport } from "next"
import localFont from "next/font/local"
import { locales } from "@/i18n/config"
import { getDictionary, getLocale } from "@/i18n/get-dictionary"
import { siteUrl } from "@/lib/site"
import "../globals.css"

// Geist (OFL) vendored in ../fonts so builds never reach Google Fonts (the Nix sandbox has no network).
const geist = localFont({
  variable: "--font-geist",
  display: "swap",
  src: [{ path: "../fonts/geist-variable.woff2", weight: "100 900", style: "normal" }],
})

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }))
}

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary()
  return {
    metadataBase: siteUrl,
    title: { default: "OpenCircle", template: "%s · OpenCircle" },
    description: t.meta.description,
    applicationName: "OpenCircle",
  }
}

export const viewport: Viewport = {
  themeColor: "#101828",
}

export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  const locale = await getLocale()
  return (
    <html lang={locale} className={`${geist.variable} h-full scroll-smooth antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  )
}
