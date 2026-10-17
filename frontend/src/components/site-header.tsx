import { Suspense } from "react"
import Link from "next/link"
import { ShieldCheck } from "lucide-react"
import { Logo } from "@/components/logo-mark"
import { HeaderAccount } from "@/components/header-account"
import { LocaleToggle } from "@/components/locale-toggle"
import { getDictionary } from "@/i18n/get-dictionary"
import { cn } from "@/lib/utils"

const navLink =
  "inline-flex h-9 items-center rounded-full px-3.5 text-sm font-medium text-brand-on-navy transition-colors outline-none hover:bg-brand-white/10 hover:text-brand-white focus-visible:ring-3 focus-visible:ring-brand-mint"

export async function SiteHeader() {
  const { locale, t } = await getDictionary()
  return (
    <header className="relative isolate overflow-hidden bg-brand-navy text-brand-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-20 right-1/4 -z-10 h-40 w-96 rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--color-brand-violet)_28%,transparent),transparent)] blur-2xl"
      />
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3.5 sm:px-6">
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
      <div className="border-t border-brand-white/10 bg-brand-white/[0.04] px-4 py-1.5">
        <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 text-center text-xs text-brand-on-navy">
          <span className="size-1.5 shrink-0 rounded-full bg-brand-mint oc-pulse" aria-hidden="true" />
          <ShieldCheck className="size-3.5 shrink-0 text-brand-mint max-sm:hidden" aria-hidden="true" />
          <p className="font-medium">{t.testFunds}</p>
        </div>
      </div>
    </header>
  )
}
