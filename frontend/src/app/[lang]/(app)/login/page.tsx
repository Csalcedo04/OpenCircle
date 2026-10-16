import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { ShieldCheck } from "lucide-react"
import { getDictionary } from "@/i18n/get-dictionary"
import { isInAppPath } from "@/lib/return-path"
import { createClient } from "@/lib/supabase/server"
import { LoginForm } from "./login-form"

// Decides on the server whether to redirect (signed in / onboarding state), so it must block
// rather than stream a shell first: streaming would turn the redirect into a visible flash.
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
    <div className="mx-auto max-w-lg px-4 py-12 sm:px-6 sm:py-16">
      {/* Bento Container Card */}
      <div className="rounded-[32px] border border-brand-line bg-brand-white p-6 shadow-2xs sm:p-8">
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-brand-violet/20 bg-brand-violet/10 px-3 py-1 text-xs font-semibold text-brand-violet-ink">
            <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
            <span>{t.auth.badge}</span>
          </div>

          <h1 className="mt-4 text-2xl font-bold tracking-tight text-brand-navy sm:text-3xl">
            {t.auth.title}
          </h1>
          <p className="mt-2 text-sm text-brand-slate">
            {t.auth.lead}
          </p>
        </div>

        <div className="mt-8">
          <LoginForm
            locale={locale}
            t={t.auth}
            linkError={error === "link"}
            next={isInAppPath(next) ? next : null}
          />
        </div>
      </div>
    </div>
  )
}
