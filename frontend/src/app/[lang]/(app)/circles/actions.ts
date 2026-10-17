"use server"

import { redirect } from "next/navigation"
import { hasLocale } from "@/i18n/config"
import { BackendError, createCircle, type ApiCircle } from "@/lib/api/backend"
import { parseWholeUnits } from "@/lib/domain/money"

export interface CreateCircleActionState {
  error: string | null
  circleId?: string | undefined
}

export async function createCircleAction(
  locale: string,
  _prev: CreateCircleActionState,
  formData: FormData,
): Promise<CreateCircleActionState> {
  if (!hasLocale(locale)) return { error: "generic" }

  const name = String(formData.get("name") ?? "").trim()
  const city = String(formData.get("city") ?? "").trim() || "Medellín"
  const amountStr = String(formData.get("amount") ?? "").trim()
  const sizeNum = Number(formData.get("size") ?? 5)
  const cadence = formData.get("cadence") === "MONTHLY" ? "MONTHLY" : "WEEKLY"
  const visibility = formData.get("visibility") === "PUBLIC" ? "PUBLIC" : "PRIVATE"
  const payoutRoundNum = Number(formData.get("payoutRound") ?? 1)

  const contribution = parseWholeUnits(amountStr, 2)
  if (!name || name.length < 3 || name.length > 80) return { error: "name" }
  if (!contribution || contribution <= 0n) return { error: "amount" }
  if (sizeNum < 2 || sizeNum > 50) return { error: "size" }
  if (payoutRoundNum < 1 || payoutRoundNum > sizeNum) return { error: "payoutRound" }

  let circle: ApiCircle
  try {
    circle = await createCircle({
      name,
      city,
      contributionValue: contribution.toString(),
      size: sizeNum,
      cadence,
      visibility,
      payoutRound: payoutRoundNum,
    })
  } catch (err) {
    if (err instanceof BackendError) {
      return { error: err.code }
    }
    return { error: "generic" }
  }

  redirect(`/${locale}/circles/${circle.id}`)
}
