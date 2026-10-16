import "server-only"

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { connection } from "next/server"
import { supabasePublicEnv } from "./env"

/**
 * Per-request client for Server Components, Server Actions and Route
 * Handlers. Acts as the signed-in user, so RLS applies. Create one per
 * request; never share it across requests.
 */
export async function createClient() {
  // Session handling reads the clock: mark the request as dynamic first so prerendering
  // never meets Date.now() (Next.js "blocking-prerender-current-time").
  await connection()
  const cookieStore = await cookies()
  const { url, publishableKey } = supabasePublicEnv()

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options)
        } catch {
          // Server Components can't write cookies; the proxy refreshes the session instead.
        }
      },
    },
  })
}
