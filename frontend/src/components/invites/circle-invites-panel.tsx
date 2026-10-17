import { FeatureUnavailable } from "@/components/feature-unavailable"
import { ServiceUnavailable } from "@/components/service-unavailable"
import type { Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import { isBackendUnavailable, isFeatureUnavailable } from "@/lib/api/backend"
import { getFriends } from "@/lib/api/friends"
import { getCircleInvites } from "@/lib/api/invites"
import type { CircleVisibility } from "@/lib/flows/circle-invite"
import { InviteManager } from "./invite-manager"
import { VisibilityToggle } from "./visibility-toggle"

type Props = {
  locale: Locale
  circleId: string
  circleName: string
  open: boolean
  isCreator: boolean
  visibility: CircleVisibility
  t: Dictionary
}

/** The managers' box on a circle page: visibility (creator), codes and direct invites, who's pending. */
export async function CircleInvitesPanel({ locale, circleId, circleName, open, isCreator, visibility, t }: Props) {
  let invites, friends
  try {
    ;[invites, friends] = await Promise.all([getCircleInvites(circleId), getFriends().catch(() => null)])
  } catch (err) {
    if (isBackendUnavailable(err)) return <ServiceUnavailable t={t.common} retryHref={`/${locale}/circles/${circleId}`} />
    if (isFeatureUnavailable(err)) return <FeatureUnavailable t={t.common} compact />
    throw err
  }

  return (
    <section className="rounded-[32px] border border-brand-line bg-brand-white p-6 shadow-2xs sm:p-8">
      <h2 className="text-lg font-bold tracking-tight text-brand-navy">{t.invites.title}</h2>
      <p className="mt-1 text-sm text-brand-slate">{t.invites.lead}</p>
      {isCreator && (
        <div className="mt-5 rounded-2xl border border-brand-line/70 bg-brand-canvas p-4">
          <VisibilityToggle locale={locale} circleId={circleId} visibility={visibility} open={open} t={t.invite} />
        </div>
      )}
      <div className="mt-6">
        <InviteManager locale={locale} circleId={circleId} circleName={circleName} open={open} invites={invites} friends={friends} t={t.invites} tShare={t.share} />
      </div>
    </section>
  )
}
