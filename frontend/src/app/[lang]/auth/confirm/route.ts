import type { EmailOtpType } from "@supabase/supabase-js"
import { NextResponse, type NextRequest } from "next/server"
import { defaultLocale, hasLocale } from "@/i18n/config"
import { landingAfterSignIn } from "@/lib/auth/landing"
import { RETURN_PATH_COOKIE } from "@/lib/return-path"
import { createClient } from "@/lib/supabase/server"

const EMAIL_OTP_TYPES: readonly EmailOtpType[] = ["email", "magiclink", "signup"]
const isEmailOtpType = (v: string | null): v is EmailOtpType => EMAIL_OTP_TYPES.includes(v as EmailOtpType)

/**
 * Magic-link landing for the `token_hash` email template. Unlike the PKCE `code`
 * link (auth/callback), it works when the email is opened on another device.
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/[lang]/auth/confirm">) {
  const { lang } = await params
  const locale = hasLocale(lang) ? lang : defaultLocale
  const tokenHash = request.nextUrl.searchParams.get("token_hash")
  const type = request.nextUrl.searchParams.get("type") ?? "email"

  if (tokenHash && isEmailOtpType(type)) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) {
      const target = await landingAfterSignIn(locale, request.cookies.get(RETURN_PATH_COOKIE)?.value)
      const res = NextResponse.redirect(new URL(target, request.url))
      // Onboarded users go straight to their destination: the saved return page is used up.
      if (!target.endsWith("/onboarding")) res.cookies.delete(RETURN_PATH_COOKIE)
      return res
    }
  }
  return NextResponse.redirect(new URL(`/${locale}/login?error=link`, request.url))
}
