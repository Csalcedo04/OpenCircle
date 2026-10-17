"use server"

import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { z } from "zod"
import { hasLocale } from "@/i18n/config"
import { RETURN_PATH_COOKIE, RETURN_PATH_MAX_AGE, isInAppPath } from "@/lib/return-path"
import { siteUrl } from "@/lib/site"
import { createClient } from "@/lib/supabase/server"

export type AuthMode = "password" | "signup" | "magic"

export type LoginState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | {
      status: "error"
      error:
        | "email"
        | "password"
        | "passwordMatch"
        | "invalidCredentials"
        | "userExists"
        | "send"
        | "generic"
    }

const emailSchema = z.string().email()
const passwordSchema = z.string().min(6)

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

/** Signs in with email and password via Supabase. */
export async function signInWithPassword(locale: string, _prev: LoginState, formData: FormData): Promise<LoginState> {
  if (!hasLocale(locale)) return { status: "error", error: "generic" }

  const emailRaw = formData.get("email")
  const passwordRaw = formData.get("password")
  const next = formData.get("next")

  const email = emailSchema.safeParse(typeof emailRaw === "string" ? emailRaw.trim() : "")
  const password = passwordSchema.safeParse(typeof passwordRaw === "string" ? passwordRaw : "")

  if (!email.success) return { status: "error", error: "email" }
  if (!password.success) return { status: "error", error: "password" }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: email.data,
    password: password.data,
  })

  if (error) {
    return { status: "error", error: "invalidCredentials" }
  }

  await persistReturnPath(next)

  const returnTarget = isInAppPath(next) ? next : `/${locale}/circles`
  redirect(returnTarget)
}

/** Registers a new account with email and password via Supabase. */
export async function signUpWithPassword(locale: string, _prev: LoginState, formData: FormData): Promise<LoginState> {
  if (!hasLocale(locale)) return { status: "error", error: "generic" }

  const emailRaw = formData.get("email")
  const passwordRaw = formData.get("password")
  const confirmPasswordRaw = formData.get("confirmPassword")
  const next = formData.get("next")

  const email = emailSchema.safeParse(typeof emailRaw === "string" ? emailRaw.trim() : "")
  const password = passwordSchema.safeParse(typeof passwordRaw === "string" ? passwordRaw : "")

  if (!email.success) return { status: "error", error: "email" }
  if (!password.success) return { status: "error", error: "password" }
  if (passwordRaw !== confirmPasswordRaw) return { status: "error", error: "passwordMatch" }

  const origin = (await headers()).get("origin") ?? siteUrl.origin
  const supabase = await createClient()

  const { data, error } = await supabase.auth.signUp({
    email: email.data,
    password: password.data,
    options: { emailRedirectTo: `${origin}/${locale}/auth/callback` },
  })

  if (error) {
    if (error.message.toLowerCase().includes("already registered") || error.status === 422) {
      return { status: "error", error: "userExists" }
    }
    return { status: "error", error: "generic" }
  }

  await persistReturnPath(next)

  // If Supabase has email autoconfirm enabled (standard in local dev/demo), session is active
  if (data?.session) {
    redirect(`/${locale}/onboarding`)
  }

  return { status: "sent", email: email.data }
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
