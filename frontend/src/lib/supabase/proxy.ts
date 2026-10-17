import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { isInAppPath, withInvite } from "@/lib/return-path"
import { isSupabaseConfigured, supabasePublicEnv } from "./env"

/**
 * Refreshes the auth session on every matched request and forwards the
 * updated cookies to both the request (for Server Components) and the
 * response (for the browser). Returns the response to send.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request })
  // No Supabase env (fresh clone, preview deploy): serve the page without a session.
  if (!isSupabaseConfigured()) return response
  const { url, publishableKey } = supabasePublicEnv()

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options)
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value)
      },
    },
  })

  // Validates the JWT (via the project's JWKS) and triggers a refresh when
  // needed. Don't put code between client creation and this call.
  const { data } = await supabase.auth.getClaims()

  // Signed-in-only pages: redirect before rendering, so it's a real 307 rather
  // than a client-side redirect from a streamed page.
  const protectedMatch = request.nextUrl.pathname.match(/^\/([a-z]{2})\/(circles|members|onboarding|friends|account)(\/|$)/)
  if (protectedMatch && !data?.claims) {
    const login = request.nextUrl.clone()
    login.pathname = `/${protectedMatch[1]}/login`
    // The path, plus the invite token when the visitor came from an invite link (see isInAppPath).
    login.search = ""
    login.searchParams.set("next", withInvite(request.nextUrl.pathname, request.nextUrl.searchParams.get("invite") ?? undefined))
    return NextResponse.redirect(login)
  }

  // Already authenticated users visiting /login get redirected to onboarding or return path
  const loginMatch = request.nextUrl.pathname.match(/^\/([a-z]{2})\/login(\/|$)/)
  if (loginMatch && data?.claims) {
    const nextParam = request.nextUrl.searchParams.get("next")
    // A URL, not a pathname assignment: the return path may carry `?invite=`.
    return NextResponse.redirect(new URL(isInAppPath(nextParam) ? nextParam : `/${loginMatch[1]}/circles`, request.nextUrl.origin))
  }

  return response
}
