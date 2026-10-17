"use server"

import { revalidatePath } from "next/cache"
import { hasLocale } from "@/i18n/config"
import { BackendError, payDebt, retryContribution } from "@/lib/api/backend"

export type PaymentActionErrorKey =
  | "walletNotAuthorized"
  | "paymentRefused"
  | "notAllowed"
  | "unavailable"
  | "generic"

export type PaymentActionState = {
  error: PaymentActionErrorKey | null
  done: boolean
}

const errorMap: Record<string, PaymentActionErrorKey> = {
  WALLET_NOT_AUTHORIZED: "walletNotAuthorized",
  NO_GRANT: "walletNotAuthorized",
  PAYMENT_REFUSED: "paymentRefused",
  QUOTE_FAILED: "paymentRefused",
  RETRY_NOT_ALLOWED: "notAllowed",
  DEBT_IN_PROGRESS: "notAllowed",
  CONTRIBUTION_NOT_FOUND: "notAllowed",
  DEBT_NOT_FOUND: "notAllowed",
  BACKEND_UNAVAILABLE: "unavailable",
}

function mapError(what: string, err: unknown): PaymentActionErrorKey {
  const code = err instanceof BackendError ? err.code : "unknown"
  console.error(what, code)
  return errorMap[code] ?? "generic"
}

export async function settleFailedContributionAction(
  locale: string,
  contributionId: string,
  mode: "retry" | "debt",
): Promise<PaymentActionState> {
  if (!hasLocale(locale)) return { error: "generic", done: false }
  try {
    if (mode === "retry") {
      const res = await retryContribution(contributionId)
      if (res.status === "FAILED") {
        revalidatePath(`/${locale}/account`)
        return { error: errorMap[res.failureCode ?? ""] ?? "paymentRefused", done: false }
      }
    } else {
      await payDebt(contributionId)
    }
  } catch (err) {
    return { error: mapError("Contribution settlement failed", err), done: false }
  }
  revalidatePath(`/${locale}/account`)
  return { error: null, done: true }
}
