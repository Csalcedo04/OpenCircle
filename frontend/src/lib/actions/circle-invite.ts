"use server"

import { revalidatePath } from "next/cache"
import { hasLocale } from "@/i18n/config"
import { BackendError } from "@/lib/api/backend"
import { rotateCircleInvite, setCircleVisibility } from "@/lib/api/circle-invite"
import { CIRCLE_VISIBILITIES, inviteErrorKey, type CircleVisibility, type InviteErrorKey } from "@/lib/flows/circle-invite"

export type InviteActionState = {
  error: InviteErrorKey | null
  /** What the API answered last, shown right away (the page also revalidates). */
  visibility: CircleVisibility
  inviteUrl: string | null
}

/**
 * The creator's invite controls, one action so both buttons share the latest state:
 *   intent=visibility, visibility=PRIVATE|PUBLIC → switch who can find and join
 *   intent=rotate                              → new invite code; the old link stops working
 */
export async function updateInviteAction(
  locale: string,
  circleId: string,
  prev: InviteActionState,
  formData: FormData,
): Promise<InviteActionState> {
  if (!hasLocale(locale)) return { ...prev, error: "generic" }
  const intent = formData.get("intent")
  const visibility = CIRCLE_VISIBILITIES.find((v) => v === formData.get("visibility"))
  try {
    let next
    if (intent === "rotate") next = await rotateCircleInvite(circleId)
    else if (intent === "visibility" && visibility) next = await setCircleVisibility(circleId, visibility)
    else return { ...prev, error: "generic" }
    revalidatePath(`/${locale}/circles/${circleId}`)
    return { error: null, ...next }
  } catch (err) {
    const code = err instanceof BackendError ? err.code : "unknown"
    console.error("Circle invite update failed", code)
    return { ...prev, error: inviteErrorKey(code) }
  }
}
