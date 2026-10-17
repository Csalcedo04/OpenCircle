"use server"

import { revalidatePath } from "next/cache"
import { hasLocale } from "@/i18n/config"
import { BackendError } from "@/lib/api/backend"
import { setCircleVisibility } from "@/lib/api/circle-invite"
import { CIRCLE_VISIBILITIES, inviteErrorKey, type CircleVisibility, type InviteErrorKey } from "@/lib/flows/circle-invite"

export type InviteActionState = {
  error: InviteErrorKey | null
  /** What the API answered last, shown right away (the page also revalidates). */
  visibility: CircleVisibility
}

/** The creator's visibility switch: intent=visibility, visibility=PRIVATE|PUBLIC. */
export async function updateInviteAction(locale: string, circleId: string, prev: InviteActionState, formData: FormData): Promise<InviteActionState> {
  if (!hasLocale(locale)) return { ...prev, error: "generic" }
  const visibility = CIRCLE_VISIBILITIES.find((v) => v === formData.get("visibility"))
  if (formData.get("intent") !== "visibility" || !visibility) return { ...prev, error: "generic" }
  try {
    const next = await setCircleVisibility(circleId, visibility)
    revalidatePath(`/${locale}/circles/${circleId}`)
    return { error: null, ...next }
  } catch (err) {
    const code = err instanceof BackendError ? err.code : "unknown"
    console.error("Circle visibility update failed", code)
    return { ...prev, error: inviteErrorKey(code) }
  }
}
