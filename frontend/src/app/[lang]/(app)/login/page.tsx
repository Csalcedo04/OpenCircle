import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getDictionary } from "@/i18n/get-dictionary"
import { createClient } from "@/lib/supabase/server"
import { LoginForm } from "./login-form"

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary()
  return { title: t.auth.title }
}

export default async function LoginPage({ searchParams }: PageProps<"/[lang]/login">) {
  const { locale, t } = await getDictionary()
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (data?.claims) redirect(`/${locale}/onboarding`)

  const { error } = await searchParams
  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <h1 className="font-heading text-4xl font-semibold tracking-[-0.03em]">{t.auth.title}</h1>
      <p className="mt-2 text-muted-foreground">{t.auth.lead}</p>
      <div className="mt-10">
        <LoginForm locale={locale} t={t.auth} linkError={error === "link"} />
      </div>
    </div>
  )
}
