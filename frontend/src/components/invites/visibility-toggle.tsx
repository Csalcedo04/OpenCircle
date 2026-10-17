"use client"

import { useActionState } from "react"
import { Globe, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import { updateInviteAction, type InviteActionState } from "@/lib/actions/circle-invite"
import type { CircleVisibility } from "@/lib/flows/circle-invite"

type Props = {
  locale: Locale
  circleId: string
  visibility: CircleVisibility
  /** Who can find the circle only changes while it is still OPEN. */
  open: boolean
  t: Dictionary["invite"]
}

/** The creator's switch between private (invite only) and public (listed for everyone). */
export function VisibilityToggle({ locale, circleId, visibility, open, t }: Props) {
  const [state, action, pending] = useActionState<InviteActionState, FormData>(updateInviteAction.bind(null, locale, circleId), { error: null, visibility })
  const isPrivate = state.visibility === "PRIVATE"
  const StatusIcon = isPrivate ? Lock : Globe

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2 text-sm text-brand-navy">
        <StatusIcon className="mt-0.5 size-4 shrink-0 text-brand-violet-ink" aria-hidden="true" />
        {isPrivate ? t.private : t.public}
      </p>
      {open ? (
        <form action={action} className="shrink-0">
          <input type="hidden" name="intent" value="visibility" />
          <input type="hidden" name="visibility" value={isPrivate ? "PUBLIC" : "PRIVATE"} />
          <Button type="submit" variant="outline" disabled={pending} className="h-9 rounded-full border-brand-line bg-brand-white px-4 text-xs font-semibold text-brand-navy hover:bg-brand-canvas">
            {isPrivate ? <Globe aria-hidden="true" /> : <Lock aria-hidden="true" />}
            {pending ? t.saving : isPrivate ? t.makePublic : t.makePrivate}
          </Button>
        </form>
      ) : (
        <p className="text-xs text-brand-slate">{t.closed}</p>
      )}
      {state.error && (
        <p role="alert" className="text-xs font-medium text-brand-violet-ink">
          {t.errors[state.error]}
        </p>
      )}
    </div>
  )
}
