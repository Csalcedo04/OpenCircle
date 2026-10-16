"use server"

import { redirect } from "next/navigation"
import { z } from "zod"
import { hasLocale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import { BackendError, createMyProfile, getMyProfile, startWalletConsent, updateMyProfile } from "@/lib/api/backend"
import { DOCUMENT_TYPES, type DocumentType } from "@/lib/domain/identity"

type ErrorKey = keyof Dictionary["onboarding"]["errors"]
type ProfileField = "fullName" | "phone" | "dob" | "nationality" | "documentType" | "documentNumber"

export type ProfileState = { errors: Partial<Record<ProfileField | "form", ErrorKey>> }
export type WalletState = { error: ErrorKey | null }

const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "")

// Mirrors the API's rules so each field gets its own message; the API validates again.
const today = () => new Date().toISOString().slice(0, 10)
const editable = {
  fullName: z.string().min(1, "fullName").max(200, "fullName"),
  phone: z.string().regex(/^\+[1-9]\d{6,14}$/, "phone"),
  dob: z.iso.date("dob").refine((d) => d <= today(), "dob"),
  nationality: z.string().toUpperCase().regex(/^[A-Z]{2}$/, "nationality"),
}
const documentPattern: Record<DocumentType, RegExp> = {
  cc: /^\d{3,15}$/,
  ti: /^\d{3,15}$/,
  ce: /^\d{3,15}$/,
  pp: /^[A-Z0-9]{5,20}$/,
}
const newProfileSchema = z
  .object({ ...editable, documentType: z.enum(DOCUMENT_TYPES, "documentType"), documentNumber: z.string().toUpperCase() })
  .refine((p) => documentPattern[p.documentType].test(p.documentNumber), { path: ["documentNumber"], message: "documentNumber" })
const patchSchema = z.object(editable)

const profileErrors: Record<string, ErrorKey> = {
  DOCUMENT_IN_USE: "documentInUse",
  EMAIL_IN_USE: "emailInUse",
  EMAIL_REQUIRED: "emailRequired",
}

/** Creates the profile on first save (identity included); afterwards updates only editable fields. */
export async function saveProfile(locale: string, _prev: ProfileState, formData: FormData): Promise<ProfileState> {
  if (!hasLocale(locale)) return { errors: { form: "generic" } }
  const fields = {
    fullName: text(formData.get("fullName")),
    phone: text(formData.get("phone")),
    dob: text(formData.get("dob")),
    nationality: text(formData.get("nationality")),
    documentType: text(formData.get("documentType")),
    documentNumber: text(formData.get("documentNumber")),
  }

  try {
    const existing = await getMyProfile()
    const parsed = existing ? patchSchema.safeParse(fields) : newProfileSchema.safeParse(fields)
    if (!parsed.success) {
      const errors: ProfileState["errors"] = {}
      for (const issue of parsed.error.issues) {
        const field = issue.path[0]
        if (typeof field === "string" && field in fields) errors[field as ProfileField] ??= field as ProfileField
      }
      return { errors }
    }
    if (existing) {
      const { fullName, phone, dob, nationality } = patchSchema.parse(fields)
      await updateMyProfile({ fullName, phone, dob, nationality })
    } else {
      await createMyProfile(newProfileSchema.parse(fields))
    }
  } catch (err) {
    const code = err instanceof BackendError ? err.code : "unknown"
    console.error("Profile save failed", code)
    return { errors: { form: profileErrors[code] ?? "generic" } }
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
  const wallet = text(formData.get("wallet"))
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
