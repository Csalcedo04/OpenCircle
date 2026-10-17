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
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <p className="inline-flex items-center gap-2 rounded-full bg-brand-mint px-3 py-1 text-sm font-medium text-brand-navy">
        <FlaskConical className="size-4" aria-hidden="true" />
        {t.badge}
      </p>
      <h1 className="mt-4 font-heading text-4xl font-semibold tracking-[-0.03em]">{title}</h1>
      <div className="mt-8">{children}</div>
    </div>
  )
}

export function SignInPanel({ locale, t, next }: { locale: Locale; t: Dictionary["devClock"]; next: string }) {
  return (
    <section className="max-w-xl rounded-3xl bg-brand-white p-6 ring-1 ring-brand-line sm:p-8">
      <p className="text-muted-foreground">{t.signIn}</p>
      <Link href={`/${locale}/login?next=${encodeURIComponent(next)}`} className={buttonVariants({ className: "mt-6 h-11 px-5 text-base" })}>
        {t.goSignIn}
      </Link>
    </section>
  )
}
