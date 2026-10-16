import Link from "next/link"
import { Logo } from "@/components/logo-mark"
import { LocaleToggle } from "@/components/locale-toggle"
import { getDictionary } from "@/i18n/get-dictionary"

const navLink =
  "inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-brand-white-smoke outline-none hover:bg-brand-white-smoke/10 focus-visible:ring-3 focus-visible:ring-brand-cool-steel"

export async function SiteHeader() {
  const { locale, t } = await getDictionary()
  return (
    <header className="bg-brand-deep-space-blue text-brand-white-smoke">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6">
        <Link
          href={`/${locale}`}
          aria-label={t.nav.home}
          className="rounded-lg text-2xl outline-none focus-visible:ring-3 focus-visible:ring-brand-cool-steel"
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
      <p className="bg-brand-baltic-blue px-4 py-1.5 text-center text-xs text-brand-white-smoke">{t.testFunds}</p>
    </header>
  )
}
