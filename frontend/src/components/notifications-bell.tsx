"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Bell, BellOff, Check, CheckCheck, LoaderCircle, UserPlus, Users, X } from "lucide-react"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { fill, type Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/lib/actions/notifications"
import type { NotificationDto, NotificationList } from "@/lib/api/notifications"
import { cn } from "@/lib/utils"
import { formatDate } from "@/lib/view"

interface Props {
  locale: Locale
  initialData: NotificationList
  t: Dictionary["notifications"]
}

export function NotificationsBell({ locale, initialData, t }: Props) {
  const [data, setData] = useState<NotificationList>(initialData)
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleMarkAllRead = () => {
    startTransition(async () => {
      // Optimistic update
      const nowIso = new Date().toISOString()
      setData((prev) => ({
        unread: 0,
        items: prev.items.map((it) => ({ ...it, readAt: it.readAt ?? nowIso })),
      }))
      await markAllNotificationsReadAction(locale)
    })
  }

  const handleMarkOneRead = (id: string) => {
    startTransition(async () => {
      const nowIso = new Date().toISOString()
      setData((prev) => ({
        unread: Math.max(0, prev.unread - 1),
        items: prev.items.map((it) => (it.id === id ? { ...it, readAt: it.readAt ?? nowIso } : it)),
      }))
      await markNotificationReadAction(locale, id)
    })
  }

  const unreadCount = data.unread

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className="relative inline-flex size-9 items-center justify-center rounded-full text-brand-on-navy transition-colors outline-none hover:bg-brand-white/10 hover:text-brand-white focus-visible:ring-3 focus-visible:ring-brand-mint"
        aria-label={t.title}
      >
        <Bell className="size-4" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-mint px-1 text-[10px] font-bold text-brand-navy ring-2 ring-brand-navy tabular-nums">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-md p-6">
        <div className="flex items-center justify-between border-b border-brand-line pb-4">
          <div className="flex items-center gap-2">
            <DialogTitle>{t.title}</DialogTitle>
            {unreadCount > 0 && (
              <span className="rounded-full bg-brand-mint/20 px-2 py-0.5 text-xs font-semibold text-brand-navy">
                {fill(t.unreadCount, { count: unreadCount })}
              </span>
            )}
          </div>
          <DialogClose className="rounded-full p-1 text-brand-slate hover:bg-brand-mist hover:text-brand-navy transition-colors">
            <X className="size-5" />
            <span className="sr-only">{t.close}</span>
          </DialogClose>
        </div>

        <DialogDescription className="sr-only">{t.title}</DialogDescription>

        {data.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-brand-mist text-brand-slate">
              <BellOff className="size-6" />
            </div>
            <h3 className="mt-3 text-base font-semibold text-brand-navy">{t.emptyTitle}</h3>
            <p className="mt-1 text-xs text-brand-slate max-w-xs">{t.emptyBody}</p>
          </div>
        ) : (
          <div className="mt-4">
            {unreadCount > 0 && (
              <div className="mb-3 flex justify-end">
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-violet-ink hover:text-brand-navy disabled:opacity-50 transition-colors"
                >
                  {isPending ? (
                    <LoaderCircle className="size-3.5 animate-spin" />
                  ) : (
                    <CheckCheck className="size-3.5 text-brand-mint" />
                  )}
                  <span>{t.markAllRead}</span>
                </button>
              </div>
            )}

            <div className="max-h-[60vh] space-y-2.5 overflow-y-auto pr-1">
              {data.items.map((item) => {
                const isUnread = !item.readAt
                return (
                  <NotificationItemCard
                    key={item.id}
                    locale={locale}
                    item={item}
                    isUnread={isUnread}
                    t={t}
                    onMarkRead={() => handleMarkOneRead(item.id)}
                    onNavigate={() => setOpen(false)}
                  />
                )
              })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function NotificationItemCard({
  locale,
  item,
  isUnread,
  t,
  onMarkRead,
  onNavigate,
}: {
  locale: Locale
  item: NotificationDto
  isUnread: boolean
  t: Dictionary["notifications"]
  onMarkRead: () => void
  onNavigate: () => void
}) {
  const isFriendReq = item.kind === "FRIEND_REQUEST"
  const actorName = item.actor?.displayName ?? "OpenCircle"
  const circleName = item.invite?.circleName ?? "Circle"

  const href = isFriendReq
    ? `/${locale}/friends`
    : item.invite?.inviteUrl ?? `/${locale}/circles`

  return (
    <div
      className={cn(
        "group relative flex items-start gap-3 rounded-2xl border p-3.5 transition-colors",
        isUnread
          ? "border-brand-mint/40 bg-brand-mint/[0.04]"
          : "border-brand-line/60 bg-brand-canvas opacity-85 hover:opacity-100",
      )}
    >
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-xl",
          isUnread ? "bg-brand-mint/20 text-brand-navy" : "bg-brand-mist text-brand-slate",
        )}
      >
        {isFriendReq ? <UserPlus className="size-4" /> : <Users className="size-4" />}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-brand-navy leading-snug">
          {isFriendReq
            ? fill(t.friendRequest, { name: actorName })
            : fill(t.circleInvite, { name: actorName, circle: circleName })}
        </p>

        <p className="mt-1 text-[11px] text-brand-slate">{formatDate(item.createdAt, locale)}</p>

        <div className="mt-2.5 flex items-center gap-3">
          <Link
            href={href}
            onClick={onNavigate}
            className="inline-flex items-center rounded-lg bg-brand-navy px-2.5 py-1 text-[11px] font-semibold text-brand-white hover:bg-brand-navy/90 transition-colors"
          >
            {isFriendReq ? t.viewFriendRequests : t.viewInvite}
          </Link>

          {isUnread && (
            <button
              type="button"
              onClick={onMarkRead}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-slate hover:text-brand-navy transition-colors"
            >
              <Check className="size-3 text-brand-mint" />
              <span>{t.markRead}</span>
            </button>
          )}
        </div>
      </div>

      {isUnread && (
        <span
          className="size-2 shrink-0 rounded-full bg-brand-mint mt-1.5"
          aria-hidden="true"
        />
      )}
    </div>
  )
}
