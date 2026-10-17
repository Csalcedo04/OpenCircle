"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { hasLocale } from "@/i18n/config"
import { BackendError, createMyInternalAccount, createMyProfile, getMyProfile, startWalletConsent, updateMyProfile } from "@/lib/api/backend"
import { accountErrorKey, type AccountErrorKey } from "@/lib/flows/onboarding"
import {
  PROFILE_INPUTS,
  parseProfileForm,
  profileErrorKey,
  type ProfileErrorKey,
  type ProfileField,
  type ProfileFormFields,
} from "@/lib/flows/profile-form"
import { walletAddressFromInput, walletErrorKey } from "@/lib/flows/wallet-consent"
import { RETURN_PATH_COOKIE, RETURN_PATH_MAX_AGE, isInAppPath } from "@/lib/return-path"

export type ProfileState = { errors: Partial<Record<ProfileField | "form", ProfileErrorKey>> }
export type WalletState = { error: ProfileErrorKey | null }
export type AccountState = { error: AccountErrorKey | null }

const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "")
const errorCode = (err: unknown) => (err instanceof BackendError ? err.code : "unknown")

// Where to land once onboarding completes; carried through redirects (and the wallet's consent
// screen) by the same cookie sign-in uses. Only in-app paths are ever stored.
async function persistReturnPath(returnPath: string | null): Promise<void> {
  if (!isInAppPath(returnPath)) return
  ;(await cookies()).set(RETURN_PATH_COOKIE, returnPath, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: RETURN_PATH_MAX_AGE,
  })
}

/** Opens the user's OpenCircle account; having one already counts as done. Then onboarding is over. */
export async function createInternalAccount(locale: string, returnPath: string | null, prev: AccountState): Promise<AccountState> {
  if (!hasLocale(locale)) return { ...prev, error: "generic" }
  try {
    await createMyInternalAccount()
  } catch (err) {
    const code = errorCode(err)
    if (code !== "INTERNAL_ACCOUNT_EXISTS") {
      console.error("Internal account creation failed", code)
      return { ...prev, error: accountErrorKey(code) }
    }
  }
  const jar = await cookies()
  const saved = jar.get(RETURN_PATH_COOKIE)?.value
  const next = isInAppPath(returnPath) ? returnPath : isInAppPath(saved) ? saved : `/${locale}/circles`
  jar.delete(RETURN_PATH_COOKIE)
  redirect(next)
}

/** Creates the profile on first save (identity included); afterwards updates only editable fields. */
export async function saveProfile(locale: string, _prev: ProfileState, formData: FormData): Promise<ProfileState> {
  if (!hasLocale(locale)) return { errors: { form: "generic" } }
  const fields = Object.fromEntries(PROFILE_INPUTS.map((f) => [f, text(formData.get(f))])) as ProfileFormFields

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

/**
 * Starts Open Payments consent and sends the browser to the user's wallet. `returnPath` is
 * where the consent callback lands afterwards (e.g. the account page); null keeps the default.
 */
export async function connectWallet(locale: string, returnPath: string | null, _prev: WalletState, formData: FormData): Promise<WalletState> {
  const wallet = walletAddressFromInput(text(formData.get("wallet")))
  if (!hasLocale(locale) || !wallet) return { error: "wallet" }

  let redirectUrl: string
  try {
    await persistReturnPath(returnPath)
    ;({ redirectUrl } = await startWalletConsent(wallet))
  } catch (err) {
    console.error("Wallet consent start failed", errorCode(err))
    return { error: walletErrorKey(errorCode(err)) }
  }
  redirect(redirectUrl)
}
