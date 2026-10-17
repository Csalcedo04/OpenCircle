import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft, CheckCircle2, ShieldCheck, Zap } from "lucide-react"
import { Avatar, PEOPLE } from "@/components/landing/shared"
import { Logo } from "@/components/logo-mark"
import { getDictionary } from "@/i18n/get-dictionary"
import { isInAppPath } from "@/lib/return-path"
import { createClient } from "@/lib/supabase/server"
import { LoginForm } from "./login-form"

export const instant = false

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary()
  return { title: t.auth.title }
}

export default async function LoginPage({ searchParams }: PageProps<"/[lang]/login">) {
  const { locale, t } = await getDictionary()
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (data?.claims) redirect(`/${locale}/onboarding`)

  const { error, next } = await searchParams

  return (
    <div className="relative isolate min-h-[calc(100vh-8rem)] overflow-hidden">
      {/* Subtle Orbital Constellation Background (Derived from Landing Page) */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-24 -z-10 h-[40rem] overflow-hidden opacity-30 select-none">
        <svg viewBox="0 0 1440 800" fill="none" className="h-full w-full">
          <circle cx="1120" cy="280" r="240" stroke="var(--color-brand-line)" strokeWidth="1.5" strokeDasharray="5 7" />
          <circle cx="1120" cy="280" r="380" stroke="color-mix(in srgb, var(--color-brand-violet) 25%, transparent)" strokeWidth="1" />
          <circle cx="280" cy="200" r="200" stroke="color-mix(in srgb, var(--color-brand-mint) 50%, transparent)" strokeWidth="1.5" strokeDasharray="4 6" />
          <path d="M 60 450 Q 720 120 1380 400" stroke="color-mix(in srgb, var(--color-brand-violet) 20%, transparent)" strokeWidth="1.5" />
        </svg>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <Link
          href={`/${locale}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-slate transition-colors hover:text-brand-navy"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          <span>{locale === "es" ? "Volver al inicio" : "Back to home"}</span>
        </Link>

        {/* Master 2-Column Split Bento Card */}
        <div className="mt-6 grid gap-8 overflow-hidden rounded-[36px] border border-brand-line bg-brand-white shadow-sm lg:grid-cols-12">
          {/* Left Column: Context, Community & Protocol Proofs */}
          <div className="relative flex flex-col justify-between bg-brand-canvas p-6 sm:p-10 lg:col-span-5 border-b border-brand-line lg:border-b-0 lg:border-r">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-brand-line bg-brand-white px-3 py-1 text-xs font-bold uppercase tracking-wider text-brand-navy shadow-2xs">
                <span className="size-2 rounded-full bg-brand-violet animate-pulse" aria-hidden="true" />
                <span>Open Payments Demo</span>
              </div>

              <div className="mt-6">
                <Logo />
              </div>

              <h2 className="mt-5 text-2xl font-bold tracking-tight text-brand-navy sm:text-3xl">
                {locale === "es" ? "Ahorro colectivo con liquidación verificada." : "Collaborative savings with verified settlement."}
              </h2>

              <p className="mt-3 text-sm leading-relaxed text-brand-slate">
                {locale === "es"
                  ? "Participa en círculos de ahorro (natilleras) con transferencias directas sobre Interledger y autorizaciones seguras GNAP en tu billetera."
                  : "Join savings circles with peer-to-peer transfers over Interledger and secure GNAP authorizations in your wallet."}
              </p>

              {/* Protocol Trust Points */}
              <ul className="mt-6 space-y-3 text-xs font-medium text-brand-navy">
                <li className="flex items-center gap-2.5">
                  <CheckCircle2 className="size-4 shrink-0 text-brand-violet" aria-hidden="true" />
                  <span>{locale === "es" ? "Cero números flotantes en saldos y cuotas" : "Zero floats in balances and rounds"}</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <ShieldCheck className="size-4 shrink-0 text-brand-violet" aria-hidden="true" />
                  <span>{locale === "es" ? "Autorizaciones de débito en tu billetera (GNAP)" : "Non-custodial debit grants in your wallet"}</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <Zap className="size-4 shrink-0 text-brand-violet" aria-hidden="true" />
                  <span>{locale === "es" ? "Liquidación confirmada con firmas de Rafiki" : "Confirmed settlement with Rafiki signatures"}</span>
                </li>
              </ul>
            </div>

            {/* Social Proof Avatars */}
            <div className="mt-8 pt-6 border-t border-brand-line/70 flex items-center gap-3">
              <div className="flex -space-x-2" aria-hidden="true">
                {PEOPLE.slice(0, 3).map((p) => (
                  <Avatar key={p.name} name={p.name} tone={p.tone} size="sm" photo />
                ))}
              </div>
              <p className="text-xs text-brand-slate">
                <span className="font-semibold text-brand-navy">María, Andrés y Lucía</span> {locale === "es" ? "ya ahorran juntos." : "are already saving together."}
              </p>
            </div>
          </div>

          {/* Right Column: Interactive Bento Auth Form */}
          <div className="flex flex-col justify-center p-6 sm:p-10 lg:col-span-7">
            <div className="mb-6">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-brand-violet/20 bg-brand-violet/10 px-3 py-1 text-xs font-semibold text-brand-violet-ink">
                <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
                <span>{t.auth.badge}</span>
              </div>
              <h1 className="mt-3 text-2xl font-bold tracking-tight text-brand-navy sm:text-3xl">
                {t.auth.title}
              </h1>
              <p className="mt-1.5 text-sm text-brand-slate">
                {t.auth.lead}
              </p>
            </div>

            <LoginForm
              locale={locale}
              t={t.auth}
              linkError={error === "link"}
              next={isInAppPath(next) ? next : null}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
