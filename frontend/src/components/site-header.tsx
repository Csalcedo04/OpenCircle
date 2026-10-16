import Link from "next/link"
import { Logo } from "@/components/logo-mark"
import { LocaleToggle } from "@/components/locale-toggle"
import { getDictionary } from "@/i18n/get-dictionary"

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
          <Link href={`/${locale}/circles`} className={navLink}>
            {t.nav.circles}
          </Link>
          <Link href={`/${locale}/circles/new`} className={navLink}>
            {t.nav.create}
          </Link>
          <LocaleToggle locale={locale} label={t.nav.language} switchTo={t.nav.switchTo} />
        </nav>
      </div>
      <p className="bg-brand-violet px-4 py-1.5 text-center text-xs text-brand-white">{t.testFunds}</p>
    </header>
  )
}
