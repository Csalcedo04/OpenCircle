"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { defaultLocale, hasLocale } from "@/i18n/config"
import { RETURN_PATH_COOKIE } from "@/lib/return-path"
import { createClient } from "@/lib/supabase/server"

/** Ends this browser's session (other devices stay signed in) and goes home. */
export async function signOut(locale: string): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: "local" })
  ;(await cookies()).delete(RETURN_PATH_COOKIE)
  redirect(`/${hasLocale(locale) ? locale : defaultLocale}`)
}
