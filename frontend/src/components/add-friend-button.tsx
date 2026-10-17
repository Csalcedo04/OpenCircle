"use client"

import { useActionState } from "react"
import { Check, LoaderCircle, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import { requestFriendByIdAction, type FriendRowState } from "@/app/[lang]/(app)/friends/actions"

type Props = { locale: Locale; userId: string; t: Dictionary["friends"] }

/** On another member's profile: sends them a friend request. */
export function AddFriendButton({ locale, userId, t }: Props) {
  const [state, action, pending] = useActionState<FriendRowState, FormData>(requestFriendByIdAction.bind(null, locale, userId), { error: null, done: false })
  if (state.done) {
    return (
      <p role="status" className="inline-flex items-center gap-1.5 rounded-full bg-brand-mint px-3 py-1.5 text-xs font-semibold text-brand-navy">
        <Check className="size-3.5" aria-hidden="true" />
        {t.requestSent}
      </p>
    )
  }
  // Already friends or already asked: say so quietly, it isn't a failure.
  const note = state.error === "alreadyFriends" || state.error === "requestPending" ? t.errors[state.error] : null
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <Button
        type="submit"
        disabled={pending}
        variant="outline"
        className="h-9 rounded-full border-brand-line bg-brand-white px-4 text-xs font-semibold text-brand-navy hover:bg-brand-canvas"
      >
        {pending ? <LoaderCircle className="motion-safe:animate-spin" aria-hidden="true" /> : <UserPlus aria-hidden="true" />}
        {t.addFriend}
      </Button>
      {note ? (
        <span className="text-xs text-brand-slate">{note}</span>
      ) : state.error ? (
        <span role="alert" className="text-xs font-medium text-brand-violet-ink">
          {t.errors[state.error]}
        </span>
      ) : null}
    </form>
  )
}
