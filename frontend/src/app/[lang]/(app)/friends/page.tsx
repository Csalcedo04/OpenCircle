import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { UsersRound } from "lucide-react"
import { ServiceUnavailable } from "@/components/service-unavailable"
import { getDictionary } from "@/i18n/get-dictionary"
import { isBackendUnavailable } from "@/lib/api/backend"
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
  try {
    ;[friends, requests] = await Promise.all([getFriends(), getFriendRequests()])
  } catch (err) {
    if (isBackendUnavailable(err)) return <ServiceUnavailable t={t.common} retryHref={`/${locale}/friends`} />
    throw err
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="inline-flex items-center gap-2 rounded-full border border-brand-violet/20 bg-brand-violet/10 px-3 py-1 text-xs font-semibold text-brand-violet-ink">
        <UsersRound className="size-3.5" aria-hidden="true" />
        <span>{t.friends.title}</span>
      </div>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-brand-navy sm:text-4xl">{t.friends.title}</h1>
      <p className="mt-2 max-w-xl text-base text-brand-slate">{t.friends.lead}</p>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
        <section className="rounded-[32px] border border-brand-line bg-brand-white p-6 shadow-2xs sm:p-8 lg:col-span-5">
          <h2 className="text-lg font-bold tracking-tight text-brand-navy">{t.friends.addTitle}</h2>
          <p className="mt-1 text-sm text-brand-slate">{t.friends.addLead}</p>
          <div className="mt-5">
            <AddFriendForm locale={locale} t={t.friends} />
          </div>
        </section>
        <div className="lg:col-span-7">
          <FriendsView locale={locale} friends={friends} incoming={requests.incoming} outgoing={requests.outgoing} t={t.friends} />
        </div>
      </div>
    </div>
  )
}
