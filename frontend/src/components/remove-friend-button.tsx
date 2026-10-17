"use client"

import { useActionState, useState } from "react"
import { LoaderCircle, UserMinus } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import { cn } from "@/lib/utils"
import { removeFriendAction, type FriendRowState } from "@/app/[lang]/(app)/friends/actions"

type Props = { locale: Locale; userId: string; t: Dictionary["friends"] }

const smallButton = "h-9 rounded-full px-3.5 text-xs font-semibold"

/**
 * Removes a friend in two steps (no browser confirm dialogs). The action revalidates the friends
 * list and the friend's profile, so the page that shows this re-renders without them.
 */
export function RemoveFriendButton({ locale, userId, t }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [state, remove, pending] = useActionState<FriendRowState, FormData>(removeFriendAction.bind(null, locale, userId), { error: null, done: false })

  return (
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
      {state.error ? (
        <p role="alert" className="text-xs font-medium text-brand-violet-ink">
          {t.errors[state.error]}
        </p>
      ) : null}
    </div>
  )
}
