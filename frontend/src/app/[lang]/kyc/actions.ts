"use server"

import { redirect } from "next/navigation"
import { hasLocale } from "@/i18n/config"
import { BackendError, startKyc } from "@/lib/api/backend"

export type KycStartState = { error: boolean }

/** Starts (or resumes) Didit verification and sends the browser to Didit's hosted flow. */
export async function startKycVerification(locale: string, returnPath: string): Promise<KycStartState> {
  if (!hasLocale(locale)) return { error: true }
  let url: string
  try {
    ;({ url } = await startKyc({ locale, returnPath }))
  } catch (err) {
    console.error("KYC start failed", err instanceof BackendError ? err.code : "unknown")
    return { error: true }
  }
  redirect(url)
}
