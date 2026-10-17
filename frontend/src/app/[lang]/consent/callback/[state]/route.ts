import { NextResponse, type NextRequest } from "next/server"
import { defaultLocale, hasLocale } from "@/i18n/config"
import { BackendError, completeWalletConsent } from "@/lib/api/backend"
import { consentFailurePath, consentFailureReason, type ConsentReason } from "@/lib/flows/wallet-consent"
import { RETURN_PATH_COOKIE, isInAppPath } from "@/lib/return-path"

/**
 * The user's wallet redirects here after the consent screen (the backend set
 * `/consent/callback/<state>`; the proxy adds the locale). Without `interact_ref`
 * and `hash` the user didn't approve.
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/[lang]/consent/callback/[state]">) {
  const { lang, state } = await params
  const locale = hasLocale(lang) ? lang : defaultLocale
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url))
  const next = request.cookies.get(RETURN_PATH_COOKIE)?.value
  const failed = (reason: ConsentReason) => to(consentFailurePath(next, locale, reason))

  const interactRef = request.nextUrl.searchParams.get("interact_ref")
  const hash = request.nextUrl.searchParams.get("hash")
  if (!interactRef || !hash) return failed("rejected")

  try {
    await completeWalletConsent({ state, interactRef, hash })
  } catch (err) {
    if (err instanceof BackendError && err.status === 401) return to(`/${locale}/login`)
    const code = err instanceof BackendError ? err.code : "unknown"
    console.error("Wallet consent completion failed", code)
    return failed(consentFailureReason(code))
  }
  // Linked: go back to where this started (sign-in's page, a circle's join page, or the account page).
  const done = NextResponse.redirect(new URL(isInAppPath(next) ? next : `/${locale}/circles`, request.url))
  done.cookies.delete(RETURN_PATH_COOKIE)
  return done
}
