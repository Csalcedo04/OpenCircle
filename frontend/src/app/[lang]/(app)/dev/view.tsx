import type { ReactNode } from "react"
import Link from "next/link"
import { FlaskConical } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import type { Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"

/** Date and time in UTC: circle periods are computed in UTC. */
export function formatDateTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "es" ? "es-CO" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(iso))
}

export function DevShell({ t, title, children }: { t: Dictionary["devClock"]; title: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="relative isolate overflow-hidden rounded-3xl border border-brand-line bg-brand-white p-6 shadow-sm sm:p-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-40 select-none"
        >
          <svg viewBox="0 0 1000 240" fill="none" className="h-full w-full">
            <circle cx="860" cy="90" r="140" stroke="var(--color-brand-line)" strokeWidth="1.5" strokeDasharray="5 7" />
            <path d="M 460 220 Q 700 30 980 150" stroke="var(--color-brand-mint)" strokeWidth="2" strokeDasharray="4 6" />
          </svg>
        </div>
        <p className="inline-flex items-center gap-2 rounded-full bg-brand-mint px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-brand-navy">
          <FlaskConical className="size-3.5" aria-hidden="true" />
          <span>{t.badge}</span>
        </p>
        <h1 className="mt-3 font-heading text-3xl font-semibold tracking-[-0.03em] text-brand-navy sm:text-4xl">{title}</h1>
      </header>
      <div className="mt-6">{children}</div>
    </div>
  )
}

export function SignInPanel({ locale, t, next }: { locale: Locale; t: Dictionary["devClock"]; next: string }) {
  return (
    <section className="max-w-xl rounded-3xl border border-brand-line bg-brand-white p-6 shadow-sm sm:p-8">
      <p className="text-sm text-brand-slate">{t.signIn}</p>
      <Link href={`/${locale}/login?next=${encodeURIComponent(next)}`} className={buttonVariants({ className: "mt-6 h-11 rounded-full px-6 text-sm font-semibold" })}>
        {t.goSignIn}
      </Link>
    </section>
  )
}
