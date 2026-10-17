import Link from "next/link"
import { LogOut, UserRound } from "lucide-react"
import { signOut } from "@/app/[lang]/auth/actions"
import type { Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import { getMyProfile } from "@/lib/api/backend"
import { headerName } from "@/lib/flows/display-name"
import { createClient } from "@/lib/supabase/server"

type Props = {
  locale: Locale
  t: Pick<Dictionary["nav"], "signIn" | "signOut" | "account">
  linkClass: string
}

/** "Sign in" when signed out; the user's name and "Sign out" when signed in. */
export async function HeaderAccount({ locale, t, linkClass }: Props) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims) {
    return (
      <Link href={`/${locale}/login`} className={linkClass}>
        {t.signIn}
      </Link>
    )
  }

  // The header must render even if the API is down: fall back to the email.
  const profile = await getMyProfile().catch(() => null)
  const name = headerName(profile?.fullName, data.claims.email)

  return (
    <>
      <Link
        href={`/${locale}/account`}
        className="hidden max-w-44 items-center gap-1.5 truncate px-2 text-sm font-medium text-brand-mint hover:text-brand-white transition-colors sm:inline-flex"
      >
        <UserRound className="size-4 shrink-0 text-brand-mint" aria-hidden="true" />
        <span className="truncate">{name}</span>
      </Link>
      <form action={signOut.bind(null, locale)}>
        <button type="submit" className={linkClass}>
          <LogOut className="size-4 sm:mr-1.5" aria-hidden="true" />
          {/* Icon only on phones so the header fits at 320px; the label stays for screen readers. */}
          <span className="sr-only sm:not-sr-only">{t.signOut}</span>
        </button>
      </form>
    </>
  )
}
