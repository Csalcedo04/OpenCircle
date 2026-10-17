import type { ReactNode } from "react"
import Link from "next/link"
import { Clock, ShieldCheck } from "lucide-react"
import { KycStartForm } from "@/components/kyc-start-form"
import { KycStatusRefresher } from "@/components/kyc-status-refresher"
import { buttonVariants } from "@/components/ui/button"
import type { Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import { ServiceUnavailable } from "@/components/service-unavailable"
import { getMyKyc, getMyProfile, isBackendUnavailable } from "@/lib/api/backend"
import { isKycPending, kycGateState } from "@/lib/flows/kyc-gate"
import { createClient } from "@/lib/supabase/server"

type Props = {
  locale: Locale
  t: Dictionary["kyc"]
  tc: Pick<Dictionary["common"], "unavailableTitle" | "unavailableBody" | "retry">
  /** Where Didit sends the user back to: the page this gate is on. */
  returnPath: string
  children: ReactNode
}

function Panel({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="relative isolate max-w-xl overflow-hidden rounded-[32px] border border-brand-line bg-brand-white p-6 shadow-2xs sm:p-8">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-40 select-none">
        <svg viewBox="0 0 600 240" fill="none" className="h-full w-full">
          <circle cx="520" cy="60" r="120" stroke="var(--color-brand-line)" strokeWidth="1.5" strokeDasharray="5 7" />
          <circle cx="520" cy="60" r="185" stroke="color-mix(in srgb, var(--color-brand-violet) 25%, transparent)" strokeWidth="1" />
        </svg>
      </div>
      <div className="flex items-center gap-3 text-brand-navy">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand-violet/10 text-brand-violet-ink">
          {icon}
        </span>
        <h2 className="text-xl font-bold tracking-[-0.02em] text-brand-navy">{title}</h2>
      </div>
      {children}
    </section>
  )
}

/**
 * Creating or joining a circle needs a signed-in, onboarded user whose identity
 * Didit approved. Anyone can browse; this gate only wraps the create/join forms.
 */
export async function KycGate({ locale, t, tc, returnPath, children }: Props) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const icon = <ShieldCheck className="size-5 shrink-0 text-brand-violet-ink" aria-hidden="true" />

  if (!data?.claims) {
    return (
      <Panel icon={icon} title={t.title}>
        <p className="mt-3 text-sm leading-relaxed text-brand-slate">{t.needsLogin}</p>
        <Link href={`/${locale}/login?next=${encodeURIComponent(returnPath)}`} className={buttonVariants({ className: "mt-6 h-11 rounded-full px-6 text-sm font-semibold" })}>
          {t.goLogin}
        </Link>
      </Panel>
    )
  }

  let profile, kyc
  try {
    profile = await getMyProfile()
    kyc = profile?.walletAddress ? await getMyKyc() : null
  } catch (err) {
    if (!isBackendUnavailable(err)) throw err
    return <ServiceUnavailable t={tc} retryHref={returnPath} />
  }
  if (!profile?.walletAddress || !kyc) {
    return (
      <Panel icon={icon} title={t.title}>
        <p className="mt-3 text-sm leading-relaxed text-brand-slate">{t.needsOnboarding}</p>
        <Link href={`/${locale}/onboarding`} className={buttonVariants({ className: "mt-6 h-11 rounded-full px-6 text-sm font-semibold" })}>
          {t.goOnboarding}
        </Link>
      </Panel>
    )
  }

  const state = kycGateState(kyc)
  if (state === "open") return <>{children}</>
  const refresher = isKycPending(kyc) ? <KycStatusRefresher /> : null

  if (state === "in-review") {
    return (
      <Panel icon={<Clock className="size-5 shrink-0 text-brand-violet-ink" aria-hidden="true" />} title={t.title}>
        <p className="mt-3 text-sm leading-relaxed text-brand-slate" role="status">
          {t.pending}
        </p>
        {refresher}
      </Panel>
    )
  }

  if (state === "checking") {
    return (
      <Panel icon={<Clock className="size-5 shrink-0 text-brand-violet-ink" aria-hidden="true" />} title={t.title}>
        <p className="mt-3 text-sm leading-relaxed text-brand-slate" role="status">
          {t.checking}
        </p>
        <KycStartForm locale={locale} returnPath={returnPath} t={{ ...t, start: t.resume }} />
        {refresher}
      </Panel>
    )
  }

  return (
    <Panel icon={icon} title={t.title}>
      <p className="mt-3 text-sm leading-relaxed text-brand-slate">{state === "declined" ? t.declined : t.lead}</p>
      <KycStartForm locale={locale} returnPath={returnPath} t={t} />
      {refresher}
    </Panel>
  )
}
