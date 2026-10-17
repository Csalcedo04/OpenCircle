import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { Logo } from "@/components/logo-mark"
import type { Locale } from "@/i18n/config"
import type { LandingDictionary } from "@/i18n/dictionaries/landing.es"
import { REPO_URL } from "@/lib/site"

const link = "rounded text-[15px] text-brand-navy/80 outline-none transition-colors hover:text-brand-navy focus-visible:ring-4 focus-visible:ring-brand-violet/30"

export function LandingFooter({ t, nav, locale }: { t: LandingDictionary["footer"]; nav: LandingDictionary["nav"]; locale: Locale }) {
  const home = `/${locale}`
  return (
    <footer className="mt-auto pb-24 md:pb-0">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 px-4 py-16 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr] lg:px-8">
        <div>
          <Link href={home} aria-label={nav.home} className="inline-block rounded-lg text-[1.6rem] outline-none focus-visible:ring-4 focus-visible:ring-brand-violet/30">
            <Logo />
          </Link>
          <p className="mt-3 text-lg font-medium">{t.tagline}</p>
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-brand-slate">{t.disclosure}</p>
        </div>
        <nav aria-labelledby="footer-product">
          <h2 id="footer-product" className="text-sm font-semibold text-brand-slate">
            {t.navTitle}
          </h2>
          <ul className="mt-4 space-y-3">
            <li><a className={link} href={`${home}#como-funciona`}>{nav.how}</a></li>
            <li><a className={link} href={`${home}#beneficios`}>{nav.benefits}</a></li>
            <li><a className={link} href={`${home}#seguridad`}>{nav.safety}</a></li>
            <li><a className={link} href={`${home}#preguntas-frecuentes`}>{nav.faq}</a></li>
            <li><Link className={link} href={`${home}/circles`}>{t.demo}</Link></li>
          </ul>
        </nav>
        <nav aria-labelledby="footer-legal">
          <h2 id="footer-legal" className="text-sm font-semibold text-brand-slate">
            {t.legalTitle}
          </h2>
          <ul className="mt-4 space-y-3">
            <li><Link className={link} href={`${home}/privacidad`}>{t.privacy}</Link></li>
            <li><Link className={link} href={`${home}/terminos`}>{t.terms}</Link></li>
            <li>
              <a className={`${link} inline-flex items-center gap-1`} href={REPO_URL} target="_blank" rel="noopener noreferrer">
                {t.source}
                <ArrowUpRight className="size-3.5" aria-hidden="true" />
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  )
}
