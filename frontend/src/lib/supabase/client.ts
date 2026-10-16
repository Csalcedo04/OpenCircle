import { createBrowserClient } from "@supabase/ssr"
import { supabasePublicEnv } from "./env"

/** Browser client for `"use client"` leaves. Publishable key only. */
export function createClient() {
  const { url, publishableKey } = supabasePublicEnv()
  return createBrowserClient(url, publishableKey)
}
