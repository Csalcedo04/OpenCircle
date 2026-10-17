"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import { Check, LoaderCircle, UserMinus, X } from "lucide-react"
import { initials } from "@/components/trust"
import { Button } from "@/components/ui/button"
import { fill, type Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import type { FriendDto, FriendRequestDto } from "@/lib/api/friends"
import { cn } from "@/lib/utils"
import { formatDate } from "@/lib/view"
import { removeFriendAction, respondFriendRequestAction, type FriendRowState } from "./actions"

type Tab = "friends" | "incoming" | "outgoing"

interface Props {
  locale: Locale
  friends: FriendDto[]
  incoming: FriendRequestDto[]
  outgoing: FriendRequestDto[]
  t: Dictionary["friends"]
}

const pill = (active: boolean) =>
  cn(
    "inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-all active:scale-95",
    active ? "bg-brand-navy text-brand-white shadow-2xs" : "bg-brand-canvas text-brand-slate hover:bg-brand-line/50 hover:text-brand-navy",
  )
const count = (active: boolean) => cn("rounded-full px-2 py-0.5 font-mono text-[11px]", active ? "bg-brand-white/20 text-brand-white" : "bg-brand-line text-brand-slate")

function Person({ locale, userId, name, meta }: { locale: Locale; userId: string; name: string; meta: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-navy font-heading text-sm font-bold text-brand-mint" aria-hidden="true">
        {initials(name)}
      </span>
      <div className="min-w-0">
        <Link href={`/${locale}/members/${userId}`} className="block truncate text-sm font-semibold text-brand-navy hover:underline">
          {name}
        </Link>
        <p className="truncate text-xs text-brand-slate">{meta}</p>
      </div>
    </div>
  )
}

const rowClass = "flex flex-col gap-3 rounded-2xl border border-brand-line/70 bg-brand-canvas p-4 sm:flex-row sm:items-center sm:justify-between"
const smallButton = "h-9 rounded-full px-3.5 text-xs font-semibold"

function RowError({ error, t }: { error: FriendRowState["error"]; t: Dictionary["friends"] }) {
  return error ? (
    <p role="alert" className="text-xs font-medium text-brand-violet-ink">
      {t.errors[error]}
    </p>
  ) : null
}

/** A request waiting for the viewer (accept / reject) or sent by them (withdraw). */
function RequestRow({ locale, request, direction, t }: { locale: Locale; request: FriendRequestDto; direction: "incoming" | "outgoing"; t: Dictionary["friends"] }) {
  const other = direction === "incoming" ? request.from : request.to
  const [accepted, accept, accepting] = useActionState<FriendRowState, FormData>(respondFriendRequestAction.bind(null, locale, request.id, "accept"), { error: null, done: false })
  const [cancelled, cancel, cancelling] = useActionState<FriendRowState, FormData>(respondFriendRequestAction.bind(null, locale, request.id, "cancel"), { error: null, done: false })
  if (accepted.done || cancelled.done) return null
  const meta = fill(direction === "incoming" ? t.receivedOn : t.requestedOn, { date: formatDate(request.createdAt, locale) })

  return (
    <li className={rowClass}>
      <Person locale={locale} userId={other.userId} name={other.displayName} meta={meta} />
      <div className="flex flex-wrap items-center gap-2">
        {direction === "incoming" && (
          <form action={accept}>
            <Button type="submit" disabled={accepting || cancelling} className={cn(smallButton, "bg-brand-violet text-brand-white hover:bg-brand-violet-ink")}>
              {accepting ? <LoaderCircle className="motion-safe:animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
              {t.accept}
            </Button>
          </form>
        )}
        <form action={cancel}>
          <Button type="submit" variant="outline" disabled={accepting || cancelling} className={cn(smallButton, "border-brand-line bg-brand-white text-brand-navy hover:bg-brand-canvas")}>
            {cancelling ? <LoaderCircle className="motion-safe:animate-spin" aria-hidden="true" /> : <X aria-hidden="true" />}
            {direction === "incoming" ? t.reject : t.cancel}
          </Button>
        </form>
        <RowError error={accepted.error ?? cancelled.error} t={t} />
      </div>
    </li>
  )
}

/** A friend, with a two-step removal (no browser confirm dialogs). */
function FriendRow({ locale, friend, t }: { locale: Locale; friend: FriendDto; t: Dictionary["friends"] }) {
  const [confirming, setConfirming] = useState(false)
  const [state, remove, pending] = useActionState<FriendRowState, FormData>(removeFriendAction.bind(null, locale, friend.userId), { error: null, done: false })
  if (state.done) return null

  return (
    <li className={rowClass}>
      <Person locale={locale} userId={friend.userId} name={friend.displayName} meta={fill(t.since, { date: formatDate(friend.since, locale) })} />
      <div className="flex flex-wrap items-center gap-2">
        {confirming ? (
          <>
            <form action={remove}>
              <Button type="submit" disabled={pending} className={cn(smallButton, "bg-brand-navy text-brand-white hover:bg-brand-navy/90")}>
                {pending ? <LoaderCircle className="motion-safe:animate-spin" aria-hidden="true" /> : <UserMinus aria-hidden="true" />}
                {t.confirmRemove}
              </Button>
            </form>
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)} className={cn(smallButton, "text-brand-navy hover:bg-brand-line/50")}>
              {t.keep}
            </Button>
          </>
        ) : (
          <Button type="button" variant="outline" onClick={() => setConfirming(true)} className={cn(smallButton, "border-brand-line bg-brand-white text-brand-navy hover:bg-brand-canvas")}>
            <UserMinus aria-hidden="true" />
            {t.remove}
          </Button>
        )}
        <RowError error={state.error} t={t} />
      </div>
    </li>
  )
}

export function FriendsView({ locale, friends, incoming, outgoing, t }: Props) {
  const [tab, setTab] = useState<Tab>(incoming.length > 0 && friends.length === 0 ? "incoming" : "friends")
  const tabs: { key: Tab; label: string; n: number }[] = [
    { key: "friends", label: t.tabs.friends, n: friends.length },
    { key: "incoming", label: t.tabs.incoming, n: incoming.length },
    { key: "outgoing", label: t.tabs.outgoing, n: outgoing.length },
  ]
  const empty = { friends: t.emptyFriends, incoming: t.emptyIncoming, outgoing: t.emptyOutgoing }[tab]
  const items = tab === "friends" ? friends : tab === "incoming" ? incoming : outgoing

  return (
    <section className="rounded-[32px] border border-brand-line bg-brand-white p-6 shadow-2xs sm:p-8">
      <div className="flex flex-wrap items-center gap-2 border-b border-brand-line pb-4">
        {tabs.map(({ key, label, n }) => (
          <button key={key} type="button" aria-pressed={tab === key} onClick={() => setTab(key)} className={pill(tab === key)}>
            <span>{label}</span>
            <span className={count(tab === key)}>{n}</span>
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="py-10 text-center text-sm text-brand-slate">{empty}</p>
      ) : (
        <ul className="mt-4 grid grid-cols-1 gap-3">
          {tab === "friends"
            ? friends.map((f) => <FriendRow key={f.userId} locale={locale} friend={f} t={t} />)
            : (tab === "incoming" ? incoming : outgoing).map((r) => <RequestRow key={r.id} locale={locale} request={r} direction={tab === "incoming" ? "incoming" : "outgoing"} t={t} />)}
        </ul>
      )}
    </section>
  )
}
