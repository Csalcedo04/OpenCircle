"use client"

import { useState, useTransition, useActionState } from "react"
import { CheckCircle2, KeyRound, Mail, Sparkles, UserPlus } from "lucide-react"
import { FormField } from "@/components/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { fill, type Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import {
  sendMagicLink,
  signInAsDemoUser,
  signInWithPassword,
  signUpWithPassword,
  type AuthMode,
  type LoginState,
} from "./actions"
import { cn } from "@/lib/utils"

type Props = {
  locale: Locale
  t: Dictionary["auth"]
  linkError: boolean
  /** In-app path to return to after sign-in; validated again on the server. */
  next: string | null
}

export function LoginForm({ locale, t, linkError, next }: Props) {
  const [mode, setMode] = useState<AuthMode>("password")
  const [isDemoPending, startDemoTransition] = useTransition()

  // State and action handlers for the active tab mode
  const [passwordState, passwordAction, passwordPending] = useActionState<LoginState, FormData>(
    signInWithPassword.bind(null, locale),
    { status: "idle" },
  )

  const [signUpState, signUpAction, signUpPending] = useActionState<LoginState, FormData>(
    signUpWithPassword.bind(null, locale),
    { status: "idle" },
  )

  const [magicState, magicAction, magicPending] = useActionState<LoginState, FormData>(
    sendMagicLink.bind(null, locale),
    { status: "idle" },
  )

  const activeState = mode === "password" ? passwordState : mode === "signup" ? signUpState : magicState
  const activeAction = mode === "password" ? passwordAction : mode === "signup" ? signUpAction : magicAction
  const isPending = mode === "password" ? passwordPending : mode === "signup" ? signUpPending : magicPending

  // Handle demo one-click evaluation login
  const handleDemoLogin = () => {
    startDemoTransition(async () => {
      await signInAsDemoUser(locale, next)
    })
  }

  // Magic Link or Signup Confirmation Success
  if (activeState.status === "sent") {
    return (
      <div className="rounded-[28px] border border-brand-mint bg-brand-mint/30 p-6 text-center text-brand-navy shadow-xs animate-in fade-in zoom-in-95 duration-200">
        <CheckCircle2 className="mx-auto size-10 text-brand-navy" aria-hidden="true" />
        <h3 className="mt-3 text-lg font-semibold tracking-tight">{t.sent.split(":")[0]}</h3>
        <p className="mt-2 text-sm leading-relaxed text-brand-navy/90">
          {fill(t.sent, { email: activeState.email })}
        </p>
        <button
          type="button"
          onClick={() => setMode("password")}
          className="mt-5 inline-flex h-9 items-center justify-center rounded-full bg-brand-navy px-4 text-xs font-semibold text-brand-white outline-none hover:bg-brand-navy/90"
        >
          {t.signIn}
        </button>
      </div>
    )
  }

  const error =
    activeState.status === "error"
      ? t.errors[activeState.error]
      : linkError && activeState.status === "idle"
        ? t.errors.link
        : undefined

  return (
    <div className="space-y-6">
      {/* Demo Evaluator One-Click Button */}
      <div className="rounded-2xl border border-brand-violet/20 bg-brand-violet/5 p-4 text-center">
        <Button
          type="button"
          onClick={handleDemoLogin}
          disabled={isDemoPending || isPending}
          className="h-11 w-full rounded-full bg-brand-violet px-5 text-sm font-semibold text-brand-white shadow-[0_6px_20px_-8px_var(--color-brand-violet)] transition-[transform,background-color] duration-150 hover:-translate-y-0.5 hover:bg-brand-violet-ink focus-visible:ring-4 focus-visible:ring-brand-violet/30 active:translate-y-0"
        >
          <Sparkles className="size-4 shrink-0" aria-hidden="true" />
          <span>{isDemoPending ? t.signingIn : t.demoUserButton}</span>
        </Button>
        <p className="mt-2 text-xs text-brand-slate">{t.demoUserSubtext}</p>
      </div>

      {/* Mode Switcher Tabs */}
      <div className="grid grid-cols-3 gap-1 rounded-full bg-brand-canvas p-1 border border-brand-line">
        <button
          type="button"
          onClick={() => setMode("password")}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-full py-2 text-xs font-semibold outline-none transition-all duration-150",
            mode === "password"
              ? "bg-brand-white text-brand-navy shadow-xs"
              : "text-brand-slate hover:text-brand-navy",
          )}
        >
          <KeyRound className="size-3.5" aria-hidden="true" />
          <span className="truncate">{t.signIn}</span>
        </button>

        <button
          type="button"
          onClick={() => setMode("signup")}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-full py-2 text-xs font-semibold outline-none transition-all duration-150",
            mode === "signup"
              ? "bg-brand-white text-brand-navy shadow-xs"
              : "text-brand-slate hover:text-brand-navy",
          )}
        >
          <UserPlus className="size-3.5" aria-hidden="true" />
          <span className="truncate">{t.tabSignUp}</span>
        </button>

        <button
          type="button"
          onClick={() => setMode("magic")}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-full py-2 text-xs font-semibold outline-none transition-all duration-150",
            mode === "magic"
              ? "bg-brand-white text-brand-navy shadow-xs"
              : "text-brand-slate hover:text-brand-navy",
          )}
        >
          <Mail className="size-3.5" aria-hidden="true" />
          <span className="truncate">{t.tabMagic}</span>
        </button>
      </div>

      {/* Auth Form */}
      <form action={activeAction} noValidate className="space-y-4">
        {next && <input type="hidden" name="next" value={next} />}

        <FormField id="email" label={t.email} error={activeState.status === "error" && activeState.error === "email" ? t.errors.email : undefined}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder={t.emailPlaceholder}
            className="h-11 rounded-xl text-base"
          />
        </FormField>

        {mode !== "magic" && (
          <FormField
            id="password"
            label={t.password}
            error={
              activeState.status === "error" && activeState.error === "password"
                ? t.errors.password
                : undefined
            }
          >
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
              placeholder={t.passwordPlaceholder}
              className="h-11 rounded-xl text-base"
            />
          </FormField>
        )}

        {mode === "signup" && (
          <FormField
            id="confirmPassword"
            label={t.confirmPassword}
            error={
              activeState.status === "error" && activeState.error === "passwordMatch"
                ? t.errors.passwordMatch
                : undefined
            }
          >
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              placeholder={t.passwordPlaceholder}
              className="h-11 rounded-xl text-base"
            />
          </FormField>
        )}

        {error && (
          <p
            className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs font-medium text-destructive"
            role="alert"
          >
            {error}
          </p>
        )}

        <Button
          type="submit"
          disabled={isPending || isDemoPending}
          className="h-11 w-full rounded-full bg-brand-navy px-5 text-sm font-semibold text-brand-white outline-none transition-[background-color,transform] hover:bg-brand-navy/90 focus-visible:ring-4 focus-visible:ring-brand-violet/30 active:scale-[0.99]"
        >
          {isPending
            ? mode === "signup"
              ? t.signingUp
              : mode === "magic"
                ? t.sending
                : t.signingIn
            : mode === "signup"
              ? t.signUp
              : mode === "magic"
                ? t.send
                : t.signIn}
        </Button>
      </form>
    </div>
  )
}
