import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { UsersRound } from "lucide-react"
import { FeatureUnavailable } from "@/components/feature-unavailable"
import { ServiceUnavailable } from "@/components/service-unavailable"
import { getDictionary } from "@/i18n/get-dictionary"
import { isBackendUnavailable, isFeatureUnavailable } from "@/lib/api/backend"
import { getFriendRequests, getFriends } from "@/lib/api/friends"
import { createClient } from "@/lib/supabase/server"
import { AddFriendForm } from "./add-friend-form"
import { FriendsView } from "./friends-view"

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary()
  return { title: t.friends.title }
}

export default async function FriendsPage() {
  const { locale, t } = await getDictionary()
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims) redirect(`/${locale}/login?next=/${locale}/friends`)

  let friends, requests
  let featureUnavailable = false
  try {
    ;[friends, requests] = await Promise.all([getFriends(), getFriendRequests()])
  } catch (err) {
    if (isBackendUnavailable(err)) {
      return (
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
          <ServiceUnavailable t={t.common} retryHref={`/${locale}/friends`} />
        </div>
      )
    }
    if (isFeatureUnavailable(err)) {
      featureUnavailable = true
    } else {
      throw err
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="relative isolate overflow-hidden rounded-[32px] sm:rounded-[40px] border border-brand-line bg-brand-white p-6 sm:p-9 shadow-[0_24px_48px_-28px_color-mix(in_srgb,var(--color-brand-navy)_22%,transparent)]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-45 select-none"
        >
          <svg viewBox="0 0 1200 320" fill="none" className="h-full w-full">
            <circle cx="1020" cy="130" r="175" stroke="var(--color-brand-line)" strokeWidth="1.5" strokeDasharray="5 7" />
            <circle cx="1020" cy="130" r="270" stroke="color-mix(in srgb, var(--color-brand-violet) 25%, transparent)" strokeWidth="1" />
            <path d="M 520 280 Q 820 40 1180 190" stroke="color-mix(in srgb, var(--color-brand-mint) 65%, transparent)" strokeWidth="2" strokeDasharray="4 6" />
          </svg>
        </div>

        <div className="inline-flex items-center gap-2 rounded-full border border-brand-line bg-brand-canvas px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-brand-navy shadow-2xs">
          <UsersRound className="size-3.5 text-brand-violet-ink" aria-hidden="true" />
          <span>{t.friends.title}</span>
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-brand-navy sm:text-5xl">{t.friends.title}</h1>
        <p className="mt-2 max-w-xl text-base leading-relaxed text-brand-slate sm:text-lg">{t.friends.lead}</p>
      </header>

      {featureUnavailable || !friends || !requests ? (
        <div className="mt-8">
          <FeatureUnavailable t={t.common} circlesHref={`/${locale}/circles`} />
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
          <section className="rounded-[32px] sm:rounded-[36px] border border-brand-line bg-brand-white p-6 shadow-[0_18px_40px_-28px_color-mix(in_srgb,var(--color-brand-navy)_25%,transparent)] sm:p-8 lg:col-span-5">
            <h2 className="text-xl font-semibold tracking-[-0.02em] text-brand-navy">{t.friends.addTitle}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-brand-slate">{t.friends.addLead}</p>
            <div className="mt-5 rounded-3xl bg-brand-mist/60 p-4 sm:p-5">
              <AddFriendForm locale={locale} t={t.friends} />
            </div>
          </section>
          <div className="lg:col-span-7">
            <FriendsView locale={locale} friends={friends} incoming={requests.incoming} outgoing={requests.outgoing} t={t.friends} />
          </div>
        </div>
      )}
    </div>
  )
}
