import { NextResponse, type NextRequest } from "next/server"
import { defaultLocale, hasLocale } from "@/i18n/config"
import { getMyKyc } from "@/lib/api/backend"
import { isInAppPath } from "@/lib/return-path"

/**
 * Didit sends the user back here. Its query values are not trusted: reading the
 * status makes the API ask Didit directly, then the gated page shows the result.
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/[lang]/kyc/callback">) {
  const { lang } = await params
  const locale = hasLocale(lang) ? lang : defaultLocale
  const next = request.nextUrl.searchParams.get("next") ?? ""
  const target = isInAppPath(next) ? next : `/${locale}/circles`

  try {
    await getMyKyc()
  } catch {
    // The gated page reads the status again and shows any error.
  }
  return NextResponse.redirect(new URL(target, request.url))
}
