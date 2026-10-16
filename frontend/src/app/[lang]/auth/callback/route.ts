import { NextResponse, type NextRequest } from "next/server"
import { defaultLocale, hasLocale } from "@/i18n/config"
import { createClient } from "@/lib/supabase/server"

/** Magic-link landing: swaps the PKCE `code` for a session cookie. */
export async function GET(request: NextRequest, { params }: RouteContext<"/[lang]/auth/callback">) {
  const { lang } = await params
  const locale = hasLocale(lang) ? lang : defaultLocale
  const code = request.nextUrl.searchParams.get("code")

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(new URL(`/${locale}/onboarding`, request.url))
  }
  return NextResponse.redirect(new URL(`/${locale}/login?error=link`, request.url))
}
