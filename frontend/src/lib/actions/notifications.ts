"use server"

import { revalidatePath } from "next/cache"
import { hasLocale } from "@/i18n/config"
import { BackendError } from "@/lib/api/backend"
import { markAllNotificationsRead, markNotificationRead } from "@/lib/api/notifications"

export type NotificationActionState = {
  error: "unavailable" | "generic" | null
  done: boolean
}

export async function markNotificationReadAction(locale: string, id: string): Promise<NotificationActionState> {
  if (!hasLocale(locale)) return { error: "generic", done: false }
  try {
    await markNotificationRead(id)
  } catch (err) {
    const code = err instanceof BackendError ? err.code : "unknown"
    return {
      error: code === "BACKEND_UNAVAILABLE" || code === "NOT_CONFIGURED" ? "unavailable" : "generic",
      done: false,
    }
  }
  revalidatePath(`/${locale}`, "layout")
  return { error: null, done: true }
}

export async function markAllNotificationsReadAction(locale: string): Promise<NotificationActionState> {
  if (!hasLocale(locale)) return { error: "generic", done: false }
  try {
    await markAllNotificationsRead()
  } catch (err) {
    const code = err instanceof BackendError ? err.code : "unknown"
    return {
      error: code === "BACKEND_UNAVAILABLE" || code === "NOT_CONFIGURED" ? "unavailable" : "generic",
      done: false,
    }
  }
  revalidatePath(`/${locale}`, "layout")
  return { error: null, done: true }
}
