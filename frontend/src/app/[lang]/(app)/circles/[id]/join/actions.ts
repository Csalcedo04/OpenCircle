"use server"

import { redirect } from "next/navigation"
import { hasLocale } from "@/i18n/config"
import { BackendError, joinCircle } from "@/lib/api/backend"
import { circleErrorKey, parseJoinForm, type CircleErrorKey, type FieldErrors } from "@/lib/flows/circles"

export type JoinState = { errors: FieldErrors; form: CircleErrorKey | null }

const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "")

/** Takes the chosen seat through the API; on success, shows the circle. */
export async function joinCircleAction(
  locale: string,
  circle: { id: string; size: number; assetScale: number; invite?: string },
  _prev: JoinState,
  formData: FormData,
): Promise<JoinState> {
  if (!hasLocale(locale)) return { errors: {}, form: "generic" }
  const parsed = parseJoinForm(
    { payoutRound: text(formData.get("payoutRound")), collateral: text(formData.get("collateral")), grantMode: text(formData.get("grantMode")) },
    circle,
  )
  if (!parsed.ok) return { errors: parsed.errors, form: null }

  try {
    await joinCircle(circle.id, parsed.seat, circle.invite)
  } catch (err) {
    const code = err instanceof BackendError ? err.code : "unknown"
    console.error("Circle join failed", code)
    return { errors: {}, form: circleErrorKey(code) }
  }
  redirect(`/${locale}/circles/${circle.id}`)
}
