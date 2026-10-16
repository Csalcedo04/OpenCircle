"use server"

import { redirect } from "next/navigation"
import { hasLocale } from "@/i18n/config"
import { BackendError, createMyProfile, getMyProfile, startWalletConsent, updateMyProfile } from "@/lib/api/backend"
import {
  PROFILE_FIELDS,
  parseProfileForm,
  profileErrorKey,
  type ProfileErrorKey,
  type ProfileField,
  type ProfileFormFields,
} from "@/lib/flows/profile-form"
import { isWalletInput, walletErrorKey } from "@/lib/flows/wallet-consent"

export type ProfileState = { errors: Partial<Record<ProfileField | "form", ProfileErrorKey>> }
export type WalletState = { error: ProfileErrorKey | null }

const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "")
const errorCode = (err: unknown) => (err instanceof BackendError ? err.code : "unknown")

/** Creates the profile on first save (identity included); afterwards updates only editable fields. */
export async function saveProfile(locale: string, _prev: ProfileState, formData: FormData): Promise<ProfileState> {
  if (!hasLocale(locale)) return { errors: { form: "generic" } }
  const fields = Object.fromEntries(PROFILE_FIELDS.map((f) => [f, text(formData.get(f))])) as ProfileFormFields

  try {
    const parsed = parseProfileForm(fields, (await getMyProfile()) ? "update" : "create")
    if (!parsed.ok) return { errors: parsed.errors }
    if (parsed.mode === "create") await createMyProfile(parsed.profile)
    else await updateMyProfile(parsed.patch)
  } catch (err) {
    console.error("Profile save failed", errorCode(err))
    return { errors: { form: profileErrorKey(errorCode(err)) } }
  }
  redirect(`/${locale}/onboarding`)
}

/** Starts Open Payments consent and sends the browser to the user's wallet. */
export async function connectWallet(locale: string, _prev: WalletState, formData: FormData): Promise<WalletState> {
  const wallet = text(formData.get("wallet"))
  if (!hasLocale(locale) || !isWalletInput(wallet)) return { error: "wallet" }

  let redirectUrl: string
  try {
    ;({ redirectUrl } = await startWalletConsent(wallet))
  } catch (err) {
    console.error("Wallet consent start failed", errorCode(err))
    return { error: walletErrorKey(errorCode(err)) }
  }
  redirect(redirectUrl)
}
