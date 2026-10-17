"use client"

import { useSyncExternalStore } from "react"
import { Calendar } from "lucide-react"
import { fill, type Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import { roundReminderStatus } from "@/lib/domain/reminders"
import type { Round } from "@/lib/domain/types"
import { cn } from "@/lib/utils"
import { formatDate } from "@/lib/view"

interface Props {
  round: Round
  contributionFormatted: string
  locale: Locale
  tReminders: Dictionary["circle"]["reminders"]
}

// Client-only hydration helper to avoid impure calls during SSR render
const subscribe = () => () => {}
const getSnapshot = () => true
const getServerSnapshot = () => false

export function RoundReminderBanner({
  round,
  contributionFormatted,
  locale,
  tReminders,
}: Props) {
  const isMounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  if (!isMounted) return null

  const reminderState = roundReminderStatus(round)
  if (!reminderState) return null

  return (
    <div
      className={cn(
        "mt-6 flex flex-col gap-3 rounded-[24px] border p-4 sm:flex-row sm:items-center sm:justify-between shadow-2xs",
        reminderState === "OVERDUE" && "border-destructive/30 bg-destructive/10 text-destructive",
        reminderState === "DUE_TODAY" && "border-brand-violet/30 bg-brand-violet/10 text-brand-violet-ink",
        reminderState === "DUE_SOON" && "border-brand-line bg-brand-canvas text-brand-navy",
      )}
    >
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-white shadow-2xs">
          <Calendar className="size-4.5 text-brand-navy" aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider">
            {reminderState === "OVERDUE"
              ? fill(tReminders.late, { amount: contributionFormatted })
              : reminderState === "DUE_TODAY"
                ? fill(tReminders.dueToday, { amount: contributionFormatted })
                : fill(tReminders.dueSoon, {
                    amount: contributionFormatted,
                    date: round ? formatDate(round.deadline, locale) : "",
                  })}
          </p>
        </div>
      </div>
      <span className="shrink-0 text-xs font-semibold text-brand-navy">
        {round ? formatDate(round.deadline, locale) : ""}
      </span>
    </div>
  )
}
