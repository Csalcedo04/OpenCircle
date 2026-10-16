import "server-only"

import { createClient } from "@supabase/supabase-js"
import { z } from "zod"
import { supabasePublicEnv } from "./env"

const secretKey = z.string().startsWith("sb_secret_")

/**
 * Privileged client that bypasses RLS. Server-only, for trusted backend work
 * (webhook handlers, audit writes). Never pass user input straight through,
 * and never return its results to the client unfiltered.
 */
export function createAdminClient() {
  const { url } = supabasePublicEnv()
  return createClient(url, secretKey.parse(process.env.SUPABASE_SECRET_KEY), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}
