"use server"

import { redirect } from "next/navigation"
import { hasLocale } from "@/i18n/config"
import { BackendError, applyToCircle, joinCircle } from "@/lib/api/backend"
import { circleErrorKey, parseJoinForm, type CircleErrorKey, type FieldErrors } from "@/lib/flows/circles"

export type JoinState = { errors: FieldErrors; form: CircleErrorKey | null }

const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "")

/** Takes a seat through the API (the round comes from the payout order); on success, shows the circle. */
export async function joinCircleAction(
  locale: string,
  circle: { id: string; assetScale: number; invite?: string },
  _prev: JoinState,
  formData: FormData,
): Promise<JoinState> {
  if (!hasLocale(locale)) return { errors: {}, form: "generic" }
  const parsed = parseJoinForm(
    { collateral: text(formData.get("collateral")), grantMode: text(formData.get("grantMode")) },
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

/** Asks for a seat in a public circle; its members decide. On success, shows the circle with a notice. */
export async function applyCircleAction(
  locale: string,
  circle: { id: string; assetScale: number },
  _prev: JoinState,
  formData: FormData,
): Promise<JoinState> {
  if (!hasLocale(locale)) return { errors: {}, form: "generic" }
  const parsed = parseJoinForm({ collateral: text(formData.get("collateral")), grantMode: text(formData.get("grantMode")) }, circle)
  if (!parsed.ok) return { errors: parsed.errors, form: null }

  try {
    await applyToCircle(circle.id, parsed.seat)
  } catch (err) {
    const code = err instanceof BackendError ? err.code : "unknown"
    console.error("Circle application failed", code)
    return { errors: {}, form: circleErrorKey(code) }
  }
  redirect(`/${locale}/circles/${circle.id}?applied=1`)
}
