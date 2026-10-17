import type { Deposit } from "@/lib/api/backend"
import { parseWholeUnits } from "@/lib/domain/money"

/** Deposit form and status logic, shared by the pages and their actions. Pure, so it's unit-tested. */

// Whole units typed by the user; 15 digits keeps the minor-unit value well inside bigint.
const MAX_WHOLE_DIGITS = 15

/** "20.000" / "20000" → minor units as a decimal string, or null when it isn't a positive whole amount. */
export function parseDepositInput(input: string, assetScale: number): string | null {
  const digits = input.replace(/[.,\s]/g, "")
  if (!/^\d{1,15}$/.test(digits) || digits.length > MAX_WHOLE_DIGITS) return null
  const minor = parseWholeUnits(input, assetScale)
  return minor === null || minor <= 0n ? null : minor.toString()
}

/** Still waiting for the money: the page keeps re-reading the status. */
export const isDepositPending = (deposit: Pick<Deposit, "status">): boolean => deposit.status === "PENDING"

export const DEPOSIT_ERROR_KEYS = ["amount", "noAccount", "openPayments", "walletNotAuthorized", "notPending", "unavailable", "generic"] as const
export type DepositErrorKey = (typeof DEPOSIT_ERROR_KEYS)[number]

const apiErrors: Record<string, DepositErrorKey> = {
  VALIDATION_ERROR: "amount",
  INTERNAL_ACCOUNT_NOT_FOUND: "noAccount",
  OPEN_PAYMENTS_ERROR: "openPayments",
  PAYMENT_REFUSED: "openPayments",
  WALLET_NOT_AUTHORIZED: "walletNotAuthorized",
  DEPOSIT_NOT_PENDING: "notPending",
  BACKEND_UNAVAILABLE: "unavailable",
}

/** API error code from creating or paying a deposit → message key. */
export const depositErrorKey = (code: string): DepositErrorKey => apiErrors[code] ?? "generic"
