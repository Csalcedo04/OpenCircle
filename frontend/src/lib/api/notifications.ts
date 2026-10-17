import "server-only"

import { z } from "zod"
import { backendFetch } from "@/lib/api/backend"
import { INVITE_STATUSES } from "@/lib/flows/invites"

export const NOTIFICATION_KINDS = ["FRIEND_REQUEST", "CIRCLE_INVITE"] as const

const notificationActorSchema = z.object({
  userId: z.uuid(),
  displayName: z.string(),
})

const notificationInviteSchema = z.object({
  id: z.uuid(),
  circleId: z.uuid(),
  circleName: z.string(),
  inviteUrl: z.url(),
  status: z.enum(INVITE_STATUSES),
  expiresAt: z.string().nullable(),
})

export const notificationSchema = z.object({
  id: z.uuid(),
  kind: z.enum(NOTIFICATION_KINDS),
  readAt: z.string().nullable(),
  createdAt: z.string(),
  actor: notificationActorSchema.nullable(),
  friendRequestId: z.uuid().nullable(),
  invite: notificationInviteSchema.nullable(),
})

export const notificationListSchema = z.object({
  unread: z.number().int().nonnegative(),
  items: z.array(notificationSchema),
})

const markAllReadSchema = z.object({
  read: z.number().int().nonnegative(),
})

export type NotificationDto = z.infer<typeof notificationSchema>
export type NotificationList = z.infer<typeof notificationListSchema>

export function getNotifications(options: { unreadOnly?: boolean; limit?: number } = {}): Promise<NotificationList> {
  const params = new URLSearchParams()
  if (options.unreadOnly !== undefined) {
    params.set("unread", options.unreadOnly ? "true" : "false")
  }
  if (options.limit !== undefined) {
    params.set("limit", String(options.limit))
  }
  const qs = params.toString()
  return backendFetch(`/notifications${qs ? `?${qs}` : ""}`, notificationListSchema)
}

export function markNotificationRead(id: string): Promise<NotificationDto> {
  return backendFetch(`/notifications/${encodeURIComponent(id)}/read`, notificationSchema, { method: "POST" })
}

export function markAllNotificationsRead(): Promise<{ read: number }> {
  return backendFetch("/notifications/read-all", markAllReadSchema, { method: "POST" })
}
