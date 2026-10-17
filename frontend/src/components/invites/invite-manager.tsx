"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import { Ban, Check, CircleCheck, CircleDashed, Clock, Copy, Globe, Link2, LoaderCircle, Mail, RotateCw, Send, Users } from "lucide-react"
import { ShareDialog } from "@/components/share-dialog"
import { FormField, describedBy } from "@/components/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { fill, type Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import type { FriendDto } from "@/lib/api/friends"
import type { InviteDto } from "@/lib/api/invites"
import {
  createInviteAction,
  revokeInviteAction,
  rotateInviteCodeAction,
  type InviteFormState,
  type RevokeState,
  type RotateStandingLinkState,
} from "@/lib/actions/circle-invites"
import { localizedInviteUrl } from "@/lib/flows/circle-invite"
import { CODE_EXPIRIES, DEFAULT_DIRECT_EXPIRY, DIRECT_EXPIRIES, inviteeLabel, type InviteStatus } from "@/lib/flows/invites"
import { cn } from "@/lib/utils"
import { formatDate } from "@/lib/view"

type Mode = "code" | "direct"

interface Props {
  locale: Locale
  circleId: string
  circleName: string
  /** Invites can only be made while the circle is OPEN; the list stays. */
  open: boolean
  invites: InviteDto[]
  /** Null when the friends list couldn't be loaded. */
  friends: FriendDto[] | null
  standingInviteUrl?: string | null | undefined
  t: Dictionary["invites"]
  tShare: Dictionary["share"]
}

const EMPTY: InviteFormState = { error: null, errors: {}, created: null }

const card = (active: boolean) =>
  cn(
    "flex flex-col items-start gap-1 rounded-2xl border p-3.5 text-left transition-all active:scale-95",
    active ? "border-brand-violet bg-brand-violet/5 ring-1 ring-brand-violet" : "border-brand-line bg-brand-canvas hover:border-brand-navy/30",
  )
const chip = (active: boolean) =>
  cn(
    "flex h-10 min-w-12 items-center justify-center rounded-xl border px-3 text-sm font-semibold transition-all active:scale-95",
    active ? "border-brand-violet bg-brand-violet text-brand-white shadow-2xs" : "border-brand-line bg-brand-canvas text-brand-navy hover:border-brand-navy/30",
  )
const submitClass =
  "h-11 w-full rounded-full bg-brand-violet px-6 text-sm font-semibold text-brand-white transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-brand-violet-ink focus-visible:ring-4 focus-visible:ring-brand-violet/30 active:translate-y-0 sm:w-auto"

const statusStyle: Record<InviteStatus, { icon: typeof Clock; className: string }> = {
  ACTIVE: { icon: Clock, className: "bg-brand-mint text-brand-navy" },
  ACCEPTED: { icon: CircleCheck, className: "bg-brand-navy text-brand-white" },
  EXPIRED: { icon: CircleDashed, className: "bg-brand-mist text-brand-navy" },
  REVOKED: { icon: Ban, className: "bg-brand-mist text-brand-navy" },
}

function StatusChip({ status, t }: { status: InviteStatus; t: Dictionary["invites"] }) {
  const { icon: Icon, className } = statusStyle[status]
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold", className)}>
      <Icon className="size-3" aria-hidden="true" />
      {t.status[status]}
    </span>
  )
}

function CopyButton({ url, t }: { url: string; t: Dictionary["invites"] }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked: the link is still in the share dialog.
    }
  }
  return (
    <Button type="button" variant="outline" onClick={copy} className="h-9 rounded-full border-brand-line bg-brand-white px-3.5 text-xs font-semibold text-brand-navy hover:bg-brand-canvas">
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      {copied ? t.copied : t.copy}
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? t.copied : ""}
      </span>
    </Button>
  )
}

function RevokeButton({ locale, circleId, inviteId, t }: { locale: Locale; circleId: string; inviteId: string; t: Dictionary["invites"] }) {
  const [state, action, pending] = useActionState<RevokeState, FormData>(revokeInviteAction.bind(null, locale, circleId, inviteId), { error: null, done: false })
  if (state.done) return <StatusChip status="REVOKED" t={t} />
  return (
    <form action={action} className="flex items-center gap-2">
      <Button type="submit" variant="ghost" disabled={pending} className="h-9 rounded-full px-3 text-xs font-semibold text-brand-navy hover:bg-brand-line/50">
        {pending ? <LoaderCircle className="motion-safe:animate-spin" aria-hidden="true" /> : <Ban aria-hidden="true" />}
        {pending ? t.revoking : t.revoke}
      </Button>
      {state.error && (
        <span role="alert" className="text-xs font-medium text-brand-violet-ink">
          {t.errors[state.error]}
        </span>
      )}
    </form>
  )
}

function ExpiryChips({ options, value, onChange, t }: { options: readonly string[]; value: string; onChange: (v: string) => void; t: Dictionary["invites"] }) {
  const label = (v: string) => t.expiries[v as keyof Dictionary["invites"]["expiries"]]
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button type="button" key={o} aria-pressed={value === o} onClick={() => onChange(o)} className={chip(value === o)}>
          {label(o)}
        </button>
      ))}
    </div>
  )
}

function FormError({ state, t }: { state: InviteFormState; t: Dictionary["invites"] }) {
  return state.error ? (
    <p role="alert" className="oc-fade-in rounded-xl bg-brand-mist p-3 text-sm font-medium text-brand-violet-ink">
      {t.errors[state.error]}
    </p>
  ) : null
}

/** Makes a shareable code; shows the new link right away. */
function CodeForm({ locale, circleId, circleName, t, tShare }: Pick<Props, "locale" | "circleId" | "circleName" | "t" | "tShare">) {
  const [expiry, setExpiry] = useState<string>("7d")
  const [state, action, pending] = useActionState<InviteFormState, FormData>(createInviteAction.bind(null, locale, circleId), EMPTY)
  const maxUsesError = state.errors.maxUses ? t.errors[state.errors.maxUses] : undefined
  const made = state.created?.[0]
  const newUrl = made?.kind === "CODE" ? localizedInviteUrl(made.inviteUrl, locale) : null

  return (
    <form action={action} noValidate className="space-y-5">
      <input type="hidden" name="intent" value="code" />
      <input type="hidden" name="expiry" value={expiry} />
      <fieldset>
        <legend className="mb-2 block text-sm font-semibold text-brand-navy">{t.expiry}</legend>
        <ExpiryChips options={CODE_EXPIRIES} value={expiry} onChange={setExpiry} t={t} />
        {state.errors.expiry && <p className="mt-1.5 text-sm font-medium text-brand-violet-ink">{t.errors[state.errors.expiry]}</p>}
      </fieldset>
      <FormField id="maxUses" label={t.maxUses} help={t.maxUsesHelp} error={maxUsesError}>
        <Input
          id="maxUses"
          name="maxUses"
          inputMode="numeric"
          placeholder="∞"
          aria-invalid={maxUsesError ? true : undefined}
          aria-describedby={describedBy("maxUses", maxUsesError)}
          className="h-11 max-w-40 rounded-xl text-base tabular-nums"
        />
      </FormField>
      <FormError state={state} t={t} />
      <Button type="submit" disabled={pending} className={submitClass}>
        {pending ? <LoaderCircle className="size-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" /> : <Link2 className="size-4 shrink-0" aria-hidden="true" />}
        <span>{pending ? t.generating : t.generate}</span>
      </Button>
      {newUrl && (
        <div role="status" className="oc-fade-in space-y-2 rounded-2xl border border-brand-mint bg-brand-mint/30 p-4">
          <p className="text-sm font-semibold text-brand-navy">{t.newLink}</p>
          <input readOnly value={newUrl} onFocus={(e) => e.currentTarget.select()} aria-label={t.newLink} className="w-full min-w-0 rounded-xl border border-brand-line bg-brand-white px-3 py-2 font-mono text-xs text-brand-navy outline-none" />
          <div className="flex flex-wrap gap-2">
            <CopyButton url={newUrl} t={t} />
            <ShareDialog url={newUrl} circleName={circleName} t={tShare} compact />
          </div>
        </div>
      )}
    </form>
  )
}

/** Invites friends (checkboxes) and typed emails; the API emails each person. */
function DirectForm({ locale, circleId, friends, t }: Pick<Props, "locale" | "circleId" | "friends" | "t">) {
  const [expiry, setExpiry] = useState<string>(DEFAULT_DIRECT_EXPIRY)
  const [state, action, pending] = useActionState<InviteFormState, FormData>(createInviteAction.bind(null, locale, circleId), EMPTY)
  const targetsError = state.errors.targets ? t.errors[state.errors.targets] : undefined

  return (
    <form action={action} noValidate className="space-y-5">
      <input type="hidden" name="intent" value="direct" />
      <input type="hidden" name="expiry" value={expiry} />

      <fieldset>
        <legend className="mb-2 block text-sm font-semibold text-brand-navy">{t.friendsLabel}</legend>
        {friends && friends.length > 0 ? (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {friends.map((f) => (
              <li key={f.userId}>
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-brand-line bg-brand-canvas px-3 py-2.5 text-sm text-brand-navy has-checked:border-brand-violet has-checked:bg-brand-violet/5">
                  <input type="checkbox" name="userIds" value={f.userId} className="size-4 accent-brand-violet" />
                  <span className="truncate font-medium">{f.displayName}</span>
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-brand-slate">
            {t.noFriends}{" "}
            <Link href={`/${locale}/friends`} className="font-semibold text-brand-violet-ink hover:underline">
              {t.friendsLink}
            </Link>
          </p>
        )}
      </fieldset>

      <FormField id="emails" label={t.emails} help={t.emailsHelp} error={targetsError}>
        <textarea
          id="emails"
          name="emails"
          rows={3}
          autoComplete="off"
          aria-invalid={targetsError ? true : undefined}
          aria-describedby={describedBy("emails", targetsError)}
          className="w-full min-w-0 rounded-xl border border-brand-line bg-brand-white px-3 py-2 text-base text-brand-navy outline-none transition-colors focus-visible:border-brand-violet focus-visible:ring-3 focus-visible:ring-brand-violet/20"
        />
      </FormField>

      <fieldset>
        <legend className="mb-2 block text-sm font-semibold text-brand-navy">{t.expiry}</legend>
        <ExpiryChips options={DIRECT_EXPIRIES} value={expiry} onChange={setExpiry} t={t} />
        {state.errors.expiry && <p className="mt-1.5 text-sm font-medium text-brand-violet-ink">{t.errors[state.errors.expiry]}</p>}
      </fieldset>

      <FormError state={state} t={t} />
      {state.created && (
        <p role="status" className="oc-fade-in rounded-xl bg-brand-mint/40 p-3 text-sm font-medium text-brand-navy">
          {fill(t.sent, { count: state.created.length })}
        </p>
      )}
      <Button type="submit" disabled={pending} className={submitClass}>
        {pending ? <LoaderCircle className="size-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" /> : <Send className="size-4 shrink-0" aria-hidden="true" />}
        <span>{pending ? t.sending : t.send}</span>
      </Button>
    </form>
  )
}

function InviteRow({ invite, locale, circleId, circleName, t, tShare }: { invite: InviteDto } & Pick<Props, "locale" | "circleId" | "circleName" | "t" | "tShare">) {
  const url = invite.kind === "CODE" ? localizedInviteUrl(invite.inviteUrl, locale) : null
  const label = invite.kind === "CODE" ? (invite.maxUses === null ? fill(t.uses, { uses: invite.uses }) : fill(t.usesOf, { uses: invite.uses, max: invite.maxUses })) : inviteeLabel(invite.invitee)
  const expiry = invite.expiresAt ? fill(t.expires, { date: formatDate(invite.expiresAt, locale) }) : t.noExpiry
  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-brand-line/70 bg-brand-canvas p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {invite.kind === "CODE" ? <Link2 className="size-4 shrink-0 text-brand-violet-ink" aria-hidden="true" /> : <Mail className="size-4 shrink-0 text-brand-violet-ink" aria-hidden="true" />}
          <span className="truncate text-sm font-semibold text-brand-navy">{label}</span>
          <StatusChip status={invite.status} t={t} />
        </div>
        <p className="mt-1 text-xs text-brand-slate">
          {expiry} · {fill(t.createdBy, { name: invite.createdByName })}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {url && invite.status === "ACTIVE" && (
          <>
            <CopyButton url={url} t={t} />
            <ShareDialog url={url} circleName={circleName} t={tShare} compact />
          </>
        )}
        {invite.status === "ACTIVE" && <RevokeButton locale={locale} circleId={circleId} inviteId={invite.id} t={t} />}
      </div>
    </li>
  )
}

function StandingLinkCard({
  locale,
  circleId,
  circleName,
  initialUrl,
  t,
  tShare,
}: {
  locale: Locale
  circleId: string
  circleName: string
  initialUrl: string
  t: Dictionary["invites"]
  tShare: Dictionary["share"]
}) {
  const [state, action, pending] = useActionState<RotateStandingLinkState, FormData>(
    rotateInviteCodeAction.bind(null, locale, circleId),
    { error: null, inviteUrl: initialUrl, rotated: false },
  )
  const rawUrl = state.inviteUrl ?? initialUrl
  const fullUrl = localizedInviteUrl(rawUrl, locale)

  return (
    <div className="rounded-2xl border border-brand-line/70 bg-brand-canvas p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-brand-navy">{t.standingLinkTitle}</p>
          <p className="mt-0.5 text-xs text-brand-slate">{t.standingLinkHelp}</p>
        </div>
        <form action={action} className="shrink-0">
          <Button
            type="submit"
            variant="outline"
            disabled={pending}
            className="h-9 rounded-full border-brand-line bg-brand-white px-3.5 text-xs font-semibold text-brand-navy hover:bg-brand-mist"
          >
            {pending ? <LoaderCircle className="size-3.5 motion-safe:animate-spin" aria-hidden="true" /> : <RotateCw className="size-3.5" aria-hidden="true" />}
            <span>{pending ? t.rotatingLink : t.rotateLink}</span>
          </Button>
        </form>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          readOnly
          value={fullUrl}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={t.standingLinkTitle}
          className="w-full min-w-0 flex-1 rounded-xl border border-brand-line bg-brand-white px-3 py-2 font-mono text-xs text-brand-navy outline-none"
        />
        <div className="flex flex-wrap gap-2">
          <CopyButton url={fullUrl} t={t} />
          <ShareDialog url={fullUrl} circleName={circleName} t={tShare} compact />
        </div>
      </div>
      {state.rotated && (
        <p role="status" className="mt-2.5 text-xs font-semibold text-brand-navy">
          {t.rotatedNotice}
        </p>
      )}
      {state.error && (
        <p role="alert" className="mt-2.5 text-xs font-semibold text-brand-violet-ink">
          {t.errors[state.error]}
        </p>
      )}
    </div>
  )
}

export function InviteManager({ locale, circleId, circleName, open, invites, friends, standingInviteUrl, t, tShare }: Props) {
  const [mode, setMode] = useState<Mode>("code")
  const codes = invites.filter((i) => i.kind === "CODE")
  const people = invites.filter((i) => i.kind === "DIRECT")

  return (
    <div className="space-y-8">
      {open && standingInviteUrl && (
        <StandingLinkCard
          locale={locale}
          circleId={circleId}
          circleName={circleName}
          initialUrl={standingInviteUrl}
          t={t}
          tShare={tShare}
        />
      )}

      {open ? (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button type="button" aria-pressed={mode === "code"} onClick={() => setMode("code")} className={card(mode === "code")}>
              <span className="flex items-center gap-2 text-sm font-semibold text-brand-navy">
                <Globe className="size-4 shrink-0 text-brand-violet" aria-hidden="true" />
                {t.modeCode}
              </span>
              <span className="text-xs text-brand-slate">{t.modeCodeHelp}</span>
            </button>
            <button type="button" aria-pressed={mode === "direct"} onClick={() => setMode("direct")} className={card(mode === "direct")}>
              <span className="flex items-center gap-2 text-sm font-semibold text-brand-navy">
                <Users className="size-4 shrink-0 text-brand-violet" aria-hidden="true" />
                {t.modeDirect}
              </span>
              <span className="text-xs text-brand-slate">{t.modeDirectHelp}</span>
            </button>
          </div>
          {mode === "code" ? (
            <CodeForm locale={locale} circleId={circleId} circleName={circleName} t={t} tShare={tShare} />
          ) : (
            <DirectForm locale={locale} circleId={circleId} friends={friends} t={t} />
          )}
        </div>
      ) : (
        <p className="rounded-2xl bg-brand-mist p-4 text-sm text-brand-navy">{t.closed}</p>
      )}

      {invites.length === 0 ? (
        <p className="text-sm text-brand-slate">{t.empty}</p>
      ) : (
        <div className="space-y-6">
          {[
            { key: "codes", title: t.listCodes, items: codes },
            { key: "people", title: t.listPeople, items: people },
          ]
            .filter((g) => g.items.length > 0)
            .map((g) => (
              <div key={g.key}>
                <h3 className="mb-3 text-sm font-semibold text-brand-navy">
                  {g.title} <span className="font-mono text-xs text-brand-slate">({g.items.length})</span>
                </h3>
                <ul className="grid grid-cols-1 gap-3">
                  {g.items.map((invite) => (
                    <InviteRow key={invite.id} invite={invite} locale={locale} circleId={circleId} circleName={circleName} t={t} tShare={tShare} />
                  ))}
                </ul>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
