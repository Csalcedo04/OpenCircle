import { Suspense } from "react"
import Link from "next/link"
import { Logo } from "@/components/logo-mark"
import { HeaderAccount } from "@/components/header-account"
import { LocaleToggle } from "@/components/locale-toggle"
import { getDictionary } from "@/i18n/get-dictionary"
import { cn } from "@/lib/utils"

const navLink =
  "inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-brand-white outline-none hover:bg-brand-white/10 focus-visible:ring-3 focus-visible:ring-brand-mint"

export async function SiteHeader() {
  const { locale, t } = await getDictionary()
  return (
    <header className="bg-brand-navy text-brand-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6">
        <Link
          href={`/${locale}`}
          aria-label={t.nav.home}
          className="rounded-lg text-2xl outline-none focus-visible:ring-3 focus-visible:ring-brand-mint"
        >
          <Logo />
        </Link>
        <nav className="flex items-center gap-1">
          {/* Below md the mobile dock carries Circles and Create; the header keeps language and account. */}
          <Link href={`/${locale}/circles`} className={cn(navLink, "max-md:hidden")}>
            {t.nav.circles}
          </Link>
          <Link href={`/${locale}/circles/new`} className={cn(navLink, "max-md:hidden")}>
            {t.nav.create}
          </Link>
          <Link href={`/${locale}/friends`} className={cn(navLink, "max-md:hidden")}>
            {t.nav.friends}
          </Link>
          <LocaleToggle locale={locale} label={t.nav.language} switchTo={t.nav.switchTo} />
          <Suspense fallback={null}>
            <HeaderAccount locale={locale} t={t.nav} linkClass={navLink} />
          </Suspense>
        </nav>
      </div>
      <p className="bg-brand-violet px-4 py-1.5 text-center text-xs text-brand-white">{t.testFunds}</p>
    </header>
  )
}
