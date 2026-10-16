import { NextResponse, type NextRequest } from "next/server"
import { defaultLocale, hasLocale, LOCALE_COOKIE, locales, type Locale } from "@/i18n/config"
import { updateSession } from "@/lib/supabase/proxy"

function preferredLocale(request: NextRequest): Locale {
  const saved = request.cookies.get(LOCALE_COOKIE)?.value
  if (saved && hasLocale(saved)) return saved
  const header = request.headers.get("accept-language") ?? ""
  const ranked = header
    .split(",")
    .map((part) => {
      const [tag = "", q] = part.trim().split(";q=")
      return { lang: tag.toLowerCase().split("-")[0] ?? "", q: q ? Number.parseFloat(q) : 1 }
    })
    .sort((a, b) => b.q - a.q)
  return ranked.map((r) => r.lang).find(hasLocale) ?? defaultLocale
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hasPrefix = locales.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`))
  if (hasPrefix) return updateSession(request)

  request.nextUrl.pathname = `/${preferredLocale(request)}${pathname === "/" ? "" : pathname}`
  return NextResponse.redirect(request.nextUrl)
}

export const config = {
  matcher: ["/((?!_next|api|.*\\..*).*)"],
}
