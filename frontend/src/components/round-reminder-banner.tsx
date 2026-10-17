import { CalendarClock } from "lucide-react"
import { fill, type Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import type { ReminderStatus } from "@/lib/domain/reminders"
import { cn } from "@/lib/utils"
import { formatDate } from "@/lib/view"

type Props = {
  status: ReminderStatus
  deadline: string
  /** The viewer's contribution, already formatted for the locale. */
  amount: string
  locale: Locale
  t: Dictionary["circle"]["reminders"]
}

/** The viewer's own unpaid contribution to the round being collected. Rendered on the server. */
export function RoundReminderBanner({ status, deadline, amount, locale, t }: Props) {
  const date = formatDate(deadline, locale)
  const message = status === "OVERDUE" ? fill(t.late, { amount }) : status === "DUE_TODAY" ? fill(t.dueToday, { amount }) : fill(t.dueSoon, { amount, date })
  return (
    <div
      role="status"
      className={cn(
        "mt-6 flex flex-col gap-3 rounded-3xl border p-4 shadow-2xs sm:flex-row sm:items-center sm:justify-between",
        status === "OVERDUE" && "border-brand-navy bg-brand-navy text-brand-white",
        status === "DUE_TODAY" && "border-brand-violet/30 bg-brand-violet/10 text-brand-violet-ink",
        status === "DUE_SOON" && "border-brand-line bg-brand-canvas text-brand-navy",
      )}
    >
      <div className="flex items-center gap-3">
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", status === "OVERDUE" ? "bg-brand-white/10 text-brand-mint" : "bg-brand-white text-brand-navy shadow-2xs")}>
          <CalendarClock className="size-4.5" aria-hidden="true" />
        </span>
        <p className="text-sm font-semibold">{message}</p>
      </div>
      <span className={cn("shrink-0 text-xs font-semibold", status === "OVERDUE" ? "text-brand-on-navy" : "text-brand-slate")}>{date}</span>
    </div>
  )
}
