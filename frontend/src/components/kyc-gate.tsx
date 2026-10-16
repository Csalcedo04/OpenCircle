import type { ReactNode } from "react"
import Link from "next/link"
import { Clock, ShieldCheck } from "lucide-react"
import { KycStartForm } from "@/components/kyc-start-form"
import { buttonVariants } from "@/components/ui/button"
import type { Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import { getMyKyc, getMyProfile } from "@/lib/api/backend"
import { createClient } from "@/lib/supabase/server"

type Props = {
  locale: Locale
  t: Dictionary["kyc"]
  /** Where Didit sends the user back to: the page this gate is on. */
  returnPath: string
  children: ReactNode
}

function Panel({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="max-w-xl rounded-3xl bg-brand-white p-6 ring-1 ring-brand-line sm:p-8">
      <div className="flex items-center gap-3 text-brand-navy">
        {icon}
        <h2 className="text-xl font-semibold tracking-[-0.02em]">{title}</h2>
      </div>
      {children}
    </section>
  )
}

/**
 * Creating or joining a circle needs a signed-in, onboarded user whose identity
 * Didit approved. Anyone can browse; this gate only wraps the create/join forms.
 */
export async function KycGate({ locale, t, returnPath, children }: Props) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const icon = <ShieldCheck className="size-5 shrink-0 text-brand-violet-ink" aria-hidden="true" />

  if (!data?.claims) {
    return (
      <Panel icon={icon} title={t.title}>
        <p className="mt-3 text-muted-foreground">{t.needsLogin}</p>
        <Link href={`/${locale}/login?next=${encodeURIComponent(returnPath)}`} className={buttonVariants({ className: "mt-6 h-11 px-5 text-base" })}>
          {t.goLogin}
        </Link>
      </Panel>
    )
  }

  const profile = await getMyProfile()
  if (!profile?.walletAddress) {
    return (
      <Panel icon={icon} title={t.title}>
        <p className="mt-3 text-muted-foreground">{t.needsOnboarding}</p>
        <Link href={`/${locale}/onboarding`} className={buttonVariants({ className: "mt-6 h-11 px-5 text-base" })}>
          {t.goOnboarding}
        </Link>
      </Panel>
    )
  }

  const kyc = await getMyKyc()
  if (kyc.approved) return <>{children}</>

  if (kyc.status === "In Review") {
    return (
      <Panel icon={<Clock className="size-5 shrink-0 text-brand-violet-ink" aria-hidden="true" />} title={t.title}>
        <p className="mt-3 text-muted-foreground" role="status">
          {t.pending}
        </p>
      </Panel>
    )
  }

  const declined = kyc.status === "Declined" || kyc.status === "Kyc Expired"
  return (
    <Panel icon={icon} title={t.title}>
      <p className="mt-3 text-muted-foreground">{declined ? t.declined : t.lead}</p>
      <KycStartForm locale={locale} returnPath={returnPath} t={t} />
    </Panel>
  )
}
