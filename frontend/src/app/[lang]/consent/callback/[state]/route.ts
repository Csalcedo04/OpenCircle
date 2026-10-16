import { NextResponse, type NextRequest } from "next/server"
import { defaultLocale, hasLocale } from "@/i18n/config"
import { BackendError, completeWalletConsent } from "@/lib/api/backend"
import { consentFailureReason } from "@/lib/flows/wallet-consent"
import { RETURN_PATH_COOKIE, isInAppPath } from "@/lib/return-path"

/**
 * The user's wallet redirects here after the consent screen (the backend set
 * `/consent/callback/<state>`; the proxy adds the locale). Without `interact_ref`
 * and `hash` the user didn't approve.
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/[lang]/consent/callback/[state]">) {
  const { lang, state } = await params
  const locale = hasLocale(lang) ? lang : defaultLocale
  const to = (path: string) => NextResponse.redirect(new URL(`/${locale}${path}`, request.url))

  const interactRef = request.nextUrl.searchParams.get("interact_ref")
  const hash = request.nextUrl.searchParams.get("hash")
  if (!interactRef || !hash) return to("/onboarding?consent=rejected")

  try {
    await completeWalletConsent({ state, interactRef, hash })
  } catch (err) {
    if (err instanceof BackendError && err.status === 401) return to("/login")
    const code = err instanceof BackendError ? err.code : "unknown"
    console.error("Wallet consent completion failed", code)
    return to(`/onboarding?consent=${consentFailureReason(code)}`)
  }
  // Onboarding is done: go back to where sign-in started (e.g. a circle's join page).
  const next = request.cookies.get(RETURN_PATH_COOKIE)?.value
  const done = NextResponse.redirect(new URL(isInAppPath(next) ? next : `/${locale}/circles`, request.url))
  done.cookies.delete(RETURN_PATH_COOKIE)
  return done
}
