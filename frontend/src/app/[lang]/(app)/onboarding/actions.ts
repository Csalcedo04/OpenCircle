"use server"

import { redirect } from "next/navigation"
import { z } from "zod"
import { hasLocale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import { BackendError, startWalletConsent, updateMyProfile, type ProfilePatch } from "@/lib/api/backend"

type ErrorKey = keyof Dictionary["onboarding"]["errors"]
type ProfileField = "fullName" | "phone" | "dob"

export type ProfileState = { errors: Partial<Record<ProfileField | "form", ErrorKey>> }
export type WalletState = { error: ErrorKey | null }

const optional = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined)

// Mirrors the API's rules so each field gets its own message; the API validates again.
const profileSchema = z.object({
  fullName: z.string().trim().min(1, "fullName").max(120, "fullName"),
  phone: z.string().regex(/^\+[1-9]\d{6,14}$/, "phone").optional(),
  dob: z.iso.date("dob").optional(),
})

export async function saveProfile(locale: string, _prev: ProfileState, formData: FormData): Promise<ProfileState> {
  if (!hasLocale(locale)) return { errors: { form: "generic" } }
  const parsed = profileSchema.safeParse({
    fullName: formData.get("fullName") ?? "",
    phone: optional(formData.get("phone")),
    dob: optional(formData.get("dob")),
  })
  if (!parsed.success) {
    const errors: ProfileState["errors"] = {}
    for (const issue of parsed.error.issues) {
      const field = issue.path[0]
      if (field === "fullName" || field === "phone" || field === "dob") errors[field] = field
    }
    return { errors }
  }

  const { fullName, phone, dob } = parsed.data
  const patch: ProfilePatch = { fullName }
  if (phone !== undefined) patch.phone = phone
  if (dob !== undefined) patch.dob = dob

  try {
    await updateMyProfile(patch)
  } catch (err) {
    console.error("Profile update failed", err instanceof BackendError ? err.code : "unknown")
    return { errors: { form: "generic" } }
  }
  redirect(`/${locale}/onboarding`)
}

const walletErrors: Record<string, ErrorKey> = {
  VALIDATION_ERROR: "wallet",
  WALLET_NOT_ALLOWED: "walletNotAllowed",
  OPEN_PAYMENTS_ERROR: "walletUnreachable",
}

/** Starts Open Payments consent and sends the browser to the user's wallet. */
export async function connectWallet(locale: string, _prev: WalletState, formData: FormData): Promise<WalletState> {
  const wallet = optional(formData.get("wallet"))
  if (!hasLocale(locale) || !wallet || !/^(\$|https:\/\/)\S+$/.test(wallet)) return { error: "wallet" }

  let redirectUrl: string
  try {
    ;({ redirectUrl } = await startWalletConsent(wallet))
  } catch (err) {
    const code = err instanceof BackendError ? err.code : "unknown"
    console.error("Wallet consent start failed", code)
    return { error: walletErrors[code] ?? "generic" }
  }
  redirect(redirectUrl)
}
