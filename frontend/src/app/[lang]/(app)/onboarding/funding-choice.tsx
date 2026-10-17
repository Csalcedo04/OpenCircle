import Link from "next/link"
import { Wallet } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import type { Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import { CreateAccountForm } from "./create-account-form"

type Props = {
  locale: Locale
  returnPath: string | null
  t: Dictionary["onboarding"]
}

/**
 * Step 2: how the user will pay contributions. An OpenCircle account (one click, test funds
 * for the demo) or their own Open Payments wallet (the GNAP consent flow). Either one onboards them.
 */
export function FundingChoice({ locale, returnPath, t }: Props) {
  return (
    <div className="grid gap-4">
      <section aria-labelledby="funding-account" className="rounded-3xl border border-brand-violet/30 bg-brand-violet/5 p-5 sm:p-6">
        <span className="inline-flex items-center rounded-full bg-brand-mint px-2.5 py-1 text-xs font-semibold text-brand-navy">
          {t.accountOption.recommended}
        </span>
        <h2 id="funding-account" className="mt-3 text-lg font-semibold tracking-[-0.02em] text-brand-navy">
          {t.accountOption.title}
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-brand-slate">{t.accountOption.body}</p>
        <div className="mt-4">
          <CreateAccountForm locale={locale} returnPath={returnPath} t={t} />
        </div>
      </section>

      <section aria-labelledby="funding-wallet" className="rounded-3xl border border-brand-line bg-brand-white p-5 sm:p-6">
        <h2 id="funding-wallet" className="text-lg font-semibold tracking-[-0.02em] text-brand-navy">
          {t.walletOption.title}
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-brand-slate">{t.walletOption.body}</p>
        <Link href={`/${locale}/onboarding?source=wallet`} className={buttonVariants({ variant: "outline", className: "mt-4 h-11 px-5" })}>
          <Wallet aria-hidden="true" />
          {t.walletOption.cta}
        </Link>
      </section>

      <p className="text-xs leading-relaxed text-brand-slate">{t.custodyNote}</p>
    </div>
  )
}
