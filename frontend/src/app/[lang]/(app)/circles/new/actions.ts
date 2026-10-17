"use server"

import { redirect } from "next/navigation"
import { hasLocale } from "@/i18n/config"
import { BackendError, createCircle } from "@/lib/api/backend"
import { circleErrorKey, parseCreateForm, type CircleErrorKey, type FieldErrors } from "@/lib/flows/circles"

export type CreateState = { errors: FieldErrors; form: CircleErrorKey | null }

const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "")

/** Creates the circle through the API (the creator takes the chosen seat), then shows it. */
export async function createCircleAction(locale: string, _prev: CreateState, formData: FormData): Promise<CreateState> {
  if (!hasLocale(locale)) return { errors: {}, form: "generic" }
  const parsed = parseCreateForm({
    name: text(formData.get("name")),
    city: text(formData.get("city")),
    amount: text(formData.get("amount")),
    size: text(formData.get("size")),
    cadence: text(formData.get("cadence")),
    payoutRound: text(formData.get("payoutRound")),
    visibility: text(formData.get("visibility")),
  })
  if (!parsed.ok) return { errors: parsed.errors, form: null }

  let id: string
  try {
    ;({ id } = await createCircle(parsed.request))
  } catch (err) {
    const code = err instanceof BackendError ? err.code : "unknown"
    console.error("Circle create failed", code)
    return { errors: {}, form: circleErrorKey(code) }
  }
  redirect(`/${locale}/circles/${id}`)
}
