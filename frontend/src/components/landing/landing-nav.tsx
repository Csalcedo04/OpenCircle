"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useId, useState } from "react"
import { Languages, Menu, X } from "lucide-react"
import { Logo } from "@/components/logo-mark"
import { LOCALE_COOKIE, type Locale } from "@/i18n/config"
import type { LandingDictionary } from "@/i18n/dictionaries/landing.es"
import { cn } from "@/lib/utils"

type Props = { locale: Locale; t: LandingDictionary["nav"] }

export function LandingNav({ locale, t }: Props) {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const pathname = usePathname()
  const home = `/${locale}`
  const links = [
    { href: `${home}#como-funciona`, label: t.how },
    { href: `${home}#beneficios`, label: t.benefits },
    { href: `${home}#seguridad`, label: t.safety },
    { href: `${home}#preguntas-frecuentes`, label: t.faq },
  ]
  const nextLocale: Locale = locale === "es" ? "en" : "es"
  const switchHref = pathname.replace(/^\/(en|es)(?=\/|$)/, `/${nextLocale}`)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  const rememberLocale = () => {
    document.cookie = `${LOCALE_COOKIE}=${nextLocale}; path=/; max-age=31536000; samesite=lax`
  }

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-300",
        scrolled || open
          ? "border-b border-brand-line bg-brand-canvas/80 backdrop-blur-xl backdrop-saturate-150"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8" aria-label={t.label}>
        <Link href={home} aria-label={t.home} className="rounded-lg text-[1.35rem] text-brand-navy outline-none focus-visible:ring-4 focus-visible:ring-brand-violet/30">
          <Logo />
        </Link>

        <ul className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="rounded-full px-3.5 py-2 text-sm font-medium text-brand-navy/80 outline-none transition-colors hover:bg-brand-mist hover:text-brand-navy focus-visible:ring-4 focus-visible:ring-brand-violet/30">
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-1.5">
          <Link
            href={switchHref}
            hrefLang={nextLocale}
            onClick={rememberLocale}
            aria-label={`${t.language}: ${t.switchTo}`}
            className="hidden h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-brand-navy/80 outline-none hover:bg-brand-mist focus-visible:ring-4 focus-visible:ring-brand-violet/30 sm:inline-flex"
          >
            <Languages className="size-4" aria-hidden="true" />
            {nextLocale.toUpperCase()}
          </Link>
          <Link
            href={`/${locale}/circles`}
            className="hidden h-10 items-center rounded-full bg-brand-navy px-4 text-sm font-semibold text-brand-white outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-4 focus-visible:ring-brand-violet/30 motion-reduce:hover:translate-y-0 sm:inline-flex"
          >
            {t.cta}
          </Link>
          <button
            type="button"
            className="grid size-11 place-items-center rounded-full text-brand-navy outline-none hover:bg-brand-mist focus-visible:ring-4 focus-visible:ring-brand-violet/30 md:hidden"
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={open ? t.close : t.menu}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
          </button>
        </div>
      </nav>

      <div id={menuId} hidden={!open} className="border-t border-brand-line md:hidden">
        <ul className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-4 sm:px-6">
          {links.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                onClick={() => setOpen(false)}
                className="flex h-12 items-center rounded-2xl px-4 text-base font-medium outline-none hover:bg-brand-mist focus-visible:ring-4 focus-visible:ring-brand-violet/30"
              >
                {l.label}
              </a>
            </li>
          ))}
          <li className="mt-2 grid grid-cols-2 gap-2">
            <Link
              href={switchHref}
              hrefLang={nextLocale}
              onClick={rememberLocale}
              className="flex h-12 items-center justify-center gap-2 rounded-full border border-brand-line text-sm font-semibold outline-none focus-visible:ring-4 focus-visible:ring-brand-violet/30"
            >
              <Languages className="size-4" aria-hidden="true" />
              {t.switchTo}
            </Link>
            <Link
              href={`/${locale}/circles`}
              onClick={() => setOpen(false)}
              className="flex h-12 items-center justify-center rounded-full bg-brand-navy text-sm font-semibold text-brand-white outline-none focus-visible:ring-4 focus-visible:ring-brand-violet/30"
            >
              {t.cta}
            </Link>
          </li>
        </ul>
      </div>
    </header>
  )
}
