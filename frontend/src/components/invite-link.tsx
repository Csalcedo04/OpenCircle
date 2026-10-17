"use client"

import { useActionState, useState } from "react"
import { Check, CheckCircle2, Copy, Globe, LoaderCircle, Lock, Mail, RefreshCw, Search, Send, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { fill, type Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import {
  searchUserByEmailAction,
  updateInviteAction,
  type EmailSearchResult,
  type InviteActionState,
} from "@/lib/actions/circle-invite"
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

/** The creator's box: private or public, the invite link to share, email search & invite, and link rotation. */
export function InviteLink({ locale, circleId, inviteUrl, visibility, open, t }: Props) {
  const [state, action, pending] = useActionState<InviteActionState, FormData>(updateInviteAction.bind(null, locale, circleId), {
    error: null,
    visibility,
    inviteUrl,
  })
  const [copied, setCopied] = useState(false)
  const [intent, setIntent] = useState<"visibility" | "rotate">("visibility")
  const [emailInput, setEmailInput] = useState("")
  const [searching, setSearching] = useState(false)
  const [searchResult, setSearchResult] = useState<EmailSearchResult | null>(null)
  const [directInvited, setDirectInvited] = useState(false)

  const url = state.inviteUrl ? localizedInviteUrl(state.inviteUrl, locale) : null
  const isPrivate = state.visibility === "PRIVATE"
  const StatusIcon = isPrivate ? Lock : Globe

  async function copy(overrideUrl?: string) {
    const textToCopy = overrideUrl ?? url
    if (!textToCopy) return
    try {
      await navigator.clipboard.writeText(textToCopy)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked
    }
  }

  async function handleSearchEmail(e: React.FormEvent) {
    e.preventDefault()
    if (!emailInput.trim()) return
    setSearching(true)
    setDirectInvited(false)
    try {
      const res = await searchUserByEmailAction(emailInput)
      setSearchResult(res)
    } finally {
      setSearching(false)
    }
  }

  async function handleSendDirectInvite() {
    if (!url) return
    await copy()
    setDirectInvited(true)
    setTimeout(() => setDirectInvited(false), 3000)
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
            <div className="mt-6 space-y-6">
              {/* Copy invite link */}
              <div className="space-y-2">
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
                    className="h-11 min-w-0 flex-1 text-sm font-mono"
                  />
                  <Button type="button" onClick={() => copy()} className="h-11 px-4">
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
              </div>

              {/* Email search and invite */}
              <div className="rounded-2xl border border-brand-line bg-brand-canvas p-5">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-brand-navy">
                  <Mail className="size-4 text-brand-violet" aria-hidden="true" />
                  <span>{t.inviteByEmail}</span>
                </h3>

                <form onSubmit={handleSearchEmail} className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Input
                    type="email"
                    required
                    placeholder={t.emailPlaceholder}
                    value={emailInput}
                    onChange={(e) => {
                      setEmailInput(e.target.value)
                      if (searchResult) setSearchResult(null)
                    }}
                    className="h-10 flex-1 text-sm bg-brand-white"
                  />
                  <Button type="submit" disabled={searching || !emailInput.trim()} className="h-10 rounded-full px-4 text-xs font-semibold">
                    {searching ? (
                      <LoaderCircle className="size-3.5 shrink-0 motion-safe:animate-spin" aria-hidden="true" />
                    ) : (
                      <Search className="size-3.5" aria-hidden="true" />
                    )}
                    <span>{searching ? t.searchingUser : t.searchUser}</span>
                  </Button>
                </form>

                {searchResult && (
                  <div className="mt-4 oc-fade-in">
                    {searchResult.found ? (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-brand-mint/60 bg-brand-mint/15 p-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex size-9 items-center justify-center rounded-full bg-brand-violet text-xs font-bold text-brand-white">
                            {searchResult.fullName ? searchResult.fullName.slice(0, 2).toUpperCase() : <User className="size-4" />}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-brand-navy">{searchResult.fullName ?? searchResult.email}</p>
                            <p className="flex items-center gap-1 text-xs text-brand-slate">
                              <CheckCircle2 className="size-3 text-brand-mint" />
                              <span>{t.userFound}</span>
                            </p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          onClick={handleSendDirectInvite}
                          className="h-9 rounded-full bg-brand-violet px-4 text-xs font-semibold text-brand-white shadow-xs hover:bg-brand-violet-ink"
                        >
                          <Send className="mr-1.5 size-3" />
                          <span>{directInvited ? t.inviteSent : t.sendDirectInvite}</span>
                        </Button>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-brand-line bg-brand-white p-3.5">
                        <div className="flex items-start gap-2.5">
                          <Mail className="mt-0.5 size-4 shrink-0 text-brand-violet" />
                          <div className="flex-1">
                            <p className="text-xs font-semibold text-brand-navy">{t.userNotFound}</p>
                            <p className="mt-0.5 text-xs text-brand-slate">{t.userNotFoundHelp}</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <a
                                href={`mailto:${encodeURIComponent(searchResult.email)}?subject=${encodeURIComponent(t.emailSubject)}&body=${encodeURIComponent(fill(t.emailBody, { link: url }))}`}
                                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-brand-violet px-3.5 text-xs font-semibold text-brand-white transition-all hover:bg-brand-violet-ink"
                              >
                                <Send className="size-3" />
                                <span>{t.sendEmailInvite}</span>
                              </a>
                              <Button type="button" variant="outline" onClick={() => copy()} className="h-8 rounded-full px-3 text-xs">
                                <Copy className="mr-1 size-3" />
                                <span>{t.copy}</span>
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Rotate link */}
              <form action={action} onSubmit={() => setIntent("rotate")} className="pt-1">
                <input type="hidden" name="intent" value="rotate" />
                <Button type="submit" variant="ghost" disabled={pending} className="h-9 px-3 text-xs">
                  <RefreshCw aria-hidden="true" className="size-3.5" />
                  {pending && intent === "rotate" ? t.rotating : t.rotate}
                </Button>
                <p className="mt-1 text-xs text-muted-foreground">{t.rotateHelp}</p>
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

