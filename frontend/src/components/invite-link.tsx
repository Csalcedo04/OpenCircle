"use client"

import { useActionState, useState } from "react"
import { Check, Copy, Globe, Lock, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import { updateInviteAction, type InviteActionState } from "@/lib/actions/circle-invite"
import { localizedInviteUrl, type CircleVisibility } from "@/lib/flows/circle-invite"

type Props = {
  locale: Locale
  circleId: string
  /** From the circle DTO; only the creator gets a link, so render this for the creator only. */
  inviteUrl: string
  visibility: CircleVisibility
  /** Who can join only changes while the circle is still OPEN. */
  open: boolean
  t: Dictionary["invite"]
}

/** The creator's box: private or public, the invite link to share, and a way to replace it. */
export function InviteLink({ locale, circleId, inviteUrl, visibility, open, t }: Props) {
  const [state, action, pending] = useActionState<InviteActionState, FormData>(updateInviteAction.bind(null, locale, circleId), {
    error: null,
    visibility,
    inviteUrl,
  })
  const [copied, setCopied] = useState(false)
  // Which button started the pending request, so only that one shows progress.
  const [intent, setIntent] = useState<"visibility" | "rotate">("visibility")
  const url = state.inviteUrl ? localizedInviteUrl(state.inviteUrl, locale) : null
  const isPrivate = state.visibility === "PRIVATE"
  const StatusIcon = isPrivate ? Lock : Globe

  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked (insecure origin or denied): the link stays selectable in the field.
    }
  }

  return (
    <section className="rounded-3xl bg-brand-white p-6 ring-1 ring-brand-line sm:p-8">
      <h2 className="font-heading text-xl font-semibold tracking-[-0.02em]">{t.title}</h2>
      <p className="mt-3 flex items-start gap-2 text-sm">
        <StatusIcon className="mt-0.5 size-4 shrink-0 text-brand-violet-ink" aria-hidden="true" />
        {isPrivate ? t.private : t.public}
      </p>

      {!open ? (
        <p className="mt-3 text-sm text-muted-foreground">{t.closed}</p>
      ) : (
        <>
          <form action={action} onSubmit={() => setIntent("visibility")} className="mt-4">
            <input type="hidden" name="intent" value="visibility" />
            <input type="hidden" name="visibility" value={isPrivate ? "PUBLIC" : "PRIVATE"} />
            <Button type="submit" variant="outline" disabled={pending} className="h-10 px-4">
              {isPrivate ? <Globe aria-hidden="true" /> : <Lock aria-hidden="true" />}
              {pending && intent === "visibility" ? t.saving : isPrivate ? t.makePublic : t.makePrivate}
            </Button>
          </form>

          {url && (
            <div className="mt-6 space-y-2">
              <label htmlFor="invite-url" className="block text-sm font-medium">
                {t.link}
              </label>
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                <Input
                  id="invite-url"
                  readOnly
                  value={url}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-describedby="invite-url-help"
                  className="h-11 min-w-0 flex-1 text-sm"
                />
                <Button type="button" onClick={copy} className="h-11 px-4">
                  {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  {copied ? t.copied : t.copy}
                </Button>
              </div>
              <p id="invite-url-help" className="text-sm text-muted-foreground">
                {t.linkHelp}
              </p>
              <span role="status" aria-live="polite" className="sr-only">
                {copied ? t.copied : ""}
              </span>

              <form action={action} onSubmit={() => setIntent("rotate")} className="pt-2">
                <input type="hidden" name="intent" value="rotate" />
                <Button type="submit" variant="ghost" disabled={pending} className="h-9 px-3">
                  <RefreshCw aria-hidden="true" />
                  {pending && intent === "rotate" ? t.rotating : t.rotate}
                </Button>
                <p className="mt-1 text-sm text-muted-foreground">{t.rotateHelp}</p>
              </form>
            </div>
          )}
        </>
      )}

      {state.error && (
        <p role="alert" className="mt-4 text-sm font-medium text-brand-violet-ink">
          {t.errors[state.error]}
        </p>
      )}
    </section>
  )
}
