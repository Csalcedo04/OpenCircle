"use server"

import { redirect } from "next/navigation"
import { hasLocale } from "@/i18n/config"
import { BackendError, createDeposit, payDepositWithWallet } from "@/lib/api/backend"
import { depositErrorKey, parseDepositInput, type DepositErrorKey } from "@/lib/flows/deposit"

export type DepositState = { error: DepositErrorKey | null }

const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "")
const errorCode = (err: unknown) => (err instanceof BackendError ? err.code : "unknown")

/** Opens a deposit for the typed amount (whole units of the account's asset) and shows its instructions. */
export async function createDepositAction(locale: string, assetScale: number, _prev: DepositState, formData: FormData): Promise<DepositState> {
  if (!hasLocale(locale)) return { error: "generic" }
  const value = parseDepositInput(text(formData.get("amount")), assetScale)
  if (value === null) return { error: "amount" }

  let id: string
  try {
    ;({ id } = await createDeposit(value))
  } catch (err) {
    console.error("Deposit creation failed", errorCode(err))
    return { error: depositErrorKey(errorCode(err)) }
  }
  redirect(`/${locale}/account/deposits/${id}`)
}

/** Pays the deposit from the user's linked wallet; the page then shows the new status. */
export async function payDepositAction(locale: string, depositId: string, prev: DepositState): Promise<DepositState> {
  if (!hasLocale(locale)) return { ...prev, error: "generic" }
  try {
    await payDepositWithWallet(depositId)
  } catch (err) {
    console.error("Deposit wallet payment failed", errorCode(err))
    return { ...prev, error: depositErrorKey(errorCode(err)) }
  }
  redirect(`/${locale}/account/deposits/${depositId}`)
}
