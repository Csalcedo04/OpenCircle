"use server"

import { revalidatePath } from "next/cache"
import { hasLocale } from "@/i18n/config"
import { BackendError, payMyDebt } from "@/lib/api/backend"

export type DebtErrorKey = "WALLET_NOT_AUTHORIZED" | "PAYMENT_REFUSED" | "DEBT_IN_PROGRESS" | "generic"

export type PayDebtState = {
  error: DebtErrorKey | null
  status: "IDLE" | "PAYING" | "PAID"
}

function mapDebtError(err: unknown): DebtErrorKey {
  if (err instanceof BackendError) {
    if (err.code === "WALLET_NOT_AUTHORIZED") return "WALLET_NOT_AUTHORIZED"
    if (err.code === "PAYMENT_REFUSED") return "PAYMENT_REFUSED"
    if (err.code === "DEBT_IN_PROGRESS") return "DEBT_IN_PROGRESS"
  }
  return "generic"
}

export async function payDebtAction(
  locale: string,
  contributionId: string,
): Promise<PayDebtState> {
  if (!hasLocale(locale)) return { error: "generic", status: "IDLE" }
  try {
    const result = await payMyDebt(contributionId)
    revalidatePath(`/${locale}/account`)
    revalidatePath(`/${locale}/circles`)
    if (result.status === "PAID") {
      return { error: null, status: "PAID" }
    }
    return { error: null, status: "PAYING" }
  } catch (err) {
    return { error: mapDebtError(err), status: "IDLE" }
  }
}
