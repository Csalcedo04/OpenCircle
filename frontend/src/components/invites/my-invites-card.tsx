import Link from "next/link"
import { ArrowRight, Mail } from "lucide-react"
import { fill, type Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import type { MyInvitationDto } from "@/lib/api/invites"
import { localizedInviteUrl } from "@/lib/flows/circle-invite"
import { formatDate } from "@/lib/view"

type Props = { locale: Locale; invites: MyInvitationDto[]; t: Dictionary["myInvites"] }

/** Direct invitations waiting for the signed-in user: each link opens the circle with its token. */
export function MyInvitesCard({ locale, invites, t }: Props) {
  return (
    <section className="rounded-[32px] border border-brand-line bg-brand-white p-6 shadow-2xs sm:p-8">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2 rounded-full bg-brand-canvas px-3 py-1 text-xs font-semibold text-brand-slate">
          <Mail className="size-3.5 text-brand-violet" aria-hidden="true" />
          <span>{t.title}</span>
        </span>
        <span className="font-mono text-xs text-brand-slate">{invites.length}</span>
      </div>

      {invites.length === 0 ? (
        <p className="mt-6 text-sm text-brand-slate">{t.empty}</p>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-3">
          {invites.map((i) => (
            <li key={i.id} className="flex flex-col gap-3 rounded-2xl border border-brand-line/70 bg-brand-canvas p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-brand-navy">{i.circle.name}</p>
                <p className="mt-0.5 text-xs text-brand-slate">
                  {fill(t.from, { name: i.invitedByName })}
                  {i.circle.city ? ` · ${i.circle.city}` : ""}
                  {" · "}
                  {i.expiresAt ? fill(t.expires, { date: formatDate(i.expiresAt, locale) }) : t.noExpiry}
                </p>
              </div>
              <Link
                href={localizedInviteUrl(i.inviteUrl, locale)}
                className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-brand-violet px-4 text-xs font-semibold text-brand-white transition-colors hover:bg-brand-violet-ink"
              >
                <span>{t.open}</span>
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
