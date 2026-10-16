import { NextResponse, type NextRequest } from "next/server"
import { defaultLocale, hasLocale } from "@/i18n/config"
import { landingAfterSignIn } from "@/lib/auth/landing"
import { RETURN_PATH_COOKIE } from "@/lib/return-path"
import { createClient } from "@/lib/supabase/server"

/** Magic-link landing: swaps the PKCE `code` for a session cookie. */
export async function GET(request: NextRequest, { params }: RouteContext<"/[lang]/auth/callback">) {
  const { lang } = await params
  const locale = hasLocale(lang) ? lang : defaultLocale
  const code = request.nextUrl.searchParams.get("code")

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
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
