"use server"

import { cookies, headers } from "next/headers"
import { z } from "zod"
import { hasLocale } from "@/i18n/config"
import { RETURN_PATH_COOKIE, RETURN_PATH_MAX_AGE, isInAppPath } from "@/lib/return-path"
import { siteUrl } from "@/lib/site"
import { createClient } from "@/lib/supabase/server"

// Magic link only, by product decision: no passwords to forget or leak.
export type LoginState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; error: "email" | "send" }

const emailSchema = z.string().email()

async function persistReturnPath(next: unknown) {
  if (isInAppPath(next)) {
    ;(await cookies()).set(RETURN_PATH_COOKIE, next, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: RETURN_PATH_MAX_AGE,
    })
  }
}

/** Emails a Supabase magic link that lands on `/[lang]/auth/callback`. */
export async function sendMagicLink(locale: string, _prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = emailSchema.safeParse(formData.get("email"))
  if (!email.success || !hasLocale(locale)) return { status: "error", error: "email" }

  const origin = (await headers()).get("origin") ?? siteUrl.origin
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: { emailRedirectTo: `${origin}/${locale}/auth/callback` },
  })
  if (error) {
    return { status: "error", error: "send" }
  }

  const next = formData.get("next")
  await persistReturnPath(next)

  return { status: "sent", email: email.data }
}
