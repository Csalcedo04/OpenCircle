"use server"

import { cookies, headers } from "next/headers"
import { z } from "zod"
import { hasLocale } from "@/i18n/config"
import { RETURN_PATH_COOKIE, RETURN_PATH_MAX_AGE, isInAppPath } from "@/lib/return-path"
import { siteUrl } from "@/lib/site"
import { createClient } from "@/lib/supabase/server"

export type LoginState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; error: "email" | "send" }

/** Emails a Supabase magic link that lands on `/[lang]/auth/callback`. */
export async function sendMagicLink(locale: string, _prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = z.email().safeParse(formData.get("email"))
  if (!email.success || !hasLocale(locale)) return { status: "error", error: "email" }

  // Supabase only redirects to URLs on the project's allowlist, so a forged Origin can't redirect elsewhere.
  const origin = (await headers()).get("origin") ?? siteUrl.origin
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: { emailRedirectTo: `${origin}/${locale}/auth/callback` },
  })
  if (error) {
    console.error("Magic link failed", error.code ?? error.status)
    return { status: "error", error: "send" }
  }

  // Where to land after sign-in and onboarding (e.g. the circle they were joining).
  const next = formData.get("next")
  if (isInAppPath(next)) {
    ;(await cookies()).set(RETURN_PATH_COOKIE, next, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: RETURN_PATH_MAX_AGE,
    })
  }
  return { status: "sent", email: email.data }
}
