import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import {
  ArrowRight,
  Award,
  CheckCircle2,
  Clock,
  ExternalLink,
  Plus,
  ShieldCheck,
  TrendingUp,
  User,
  Wallet,
  Zap,
} from "lucide-react"
import { fill } from "@/i18n/config"
import { getDictionary } from "@/i18n/get-dictionary"
import { MyInvitesCard } from "@/components/invites/my-invites-card"
import { getMyCircles, getMyKyc, getMyProfile, getMySavings } from "@/lib/api/backend"
import { getMyInvitations } from "@/lib/api/invites"
import { amount, formatAmount } from "@/lib/domain/money"
import { createClient } from "@/lib/supabase/server"

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary()
  return { title: t.account.title }
}

export default async function AccountPage() {
  const { locale, t } = await getDictionary()
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()

  if (!data?.claims) {
    redirect(`/${locale}/login`)
  }

  const [profile, kyc, savings, myCircles, invitations] = await Promise.all([
    getMyProfile().catch(() => null),
    getMyKyc().catch(() => null),
    getMySavings().catch(() => null),
    getMyCircles().catch(() => []),
    getMyInvitations().catch(() => []),
  ])

  const userEmail = data.claims.email ?? profile?.email ?? "usuario@ejemplo.com"
  const displayName = profile?.fullName ?? userEmail.split("@")[0] ?? "Usuario"
  const walletAddr = profile?.walletAddress ?? savings?.walletAddress ?? null

  const balanceBigInt = savings?.balance?.value ? BigInt(savings.balance.value) : 0n
  const balanceFormatted = formatAmount(
    amount(balanceBigInt, savings?.balance ?? { assetCode: "COP", assetScale: 2 }),
    locale,
  )

  const icsScore = savings?.ics ?? null
  const icsDisplay = icsScore !== null ? fill(t.account.scoreCalculated, { score: icsScore }) : t.account.scorePending

  const activeCount = myCircles.filter((c) => c.status === "ACTIVE" || c.status === "OPEN").length
  const completedCount = myCircles.filter((c) => c.status === "COMPLETED").length

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-violet/20 bg-brand-violet/10 px-3 py-1 text-xs font-semibold text-brand-violet-ink">
            <span className="size-1.5 rounded-full bg-brand-violet" />
            <span>OpenCircle Account & Finances</span>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-brand-navy sm:text-4xl">
            {t.account.title}
          </h1>
          <p className="mt-2 text-base text-brand-slate max-w-xl">
            {t.account.lead}
          </p>
        </div>

        <Link
          href={`/${locale}/circles`}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-brand-line bg-brand-white px-5 text-sm font-semibold text-brand-navy shadow-2xs hover:bg-brand-canvas transition-colors"
        >
          <span>{t.circles.allTab}</span>
          <ArrowRight className="size-4 shrink-0" />
        </Link>
      </div>

      {/* Main Bento Grid */}
      <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Card 1: Identity & Profile (7 cols) */}
        <div className="rounded-[32px] border border-brand-line bg-brand-white p-6 shadow-2xs sm:p-8 lg:col-span-7 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 rounded-full bg-brand-canvas px-3 py-1 text-xs font-semibold text-brand-slate">
                <User className="size-3.5 text-brand-slate" />
                <span>{locale === "es" ? "Datos Personales" : "Personal Profile"}</span>
              </span>

              {kyc?.approved ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-mint/40 border border-brand-mint px-3 py-1 text-xs font-semibold text-brand-navy">
                  <ShieldCheck className="size-3.5 text-brand-navy" />
                  <span>{t.account.kycVerified}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 px-3 py-1 text-xs font-semibold text-amber-800">
                  <Clock className="size-3.5 text-amber-700" />
                  <span>{t.account.kycPending}</span>
                </span>
              )}
            </div>

            <div className="mt-6 flex items-start gap-4">
              <div className="size-16 rounded-full bg-brand-navy text-brand-mint flex items-center justify-center font-heading text-xl font-bold shrink-0">
                {displayName.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h2 className="text-2xl font-bold tracking-tight text-brand-navy truncate">
                  {displayName}
                </h2>
                <p className="text-xs text-brand-slate mt-0.5">{userEmail}</p>

                {profile?.documentNumber && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-brand-navy">
                    <span className="rounded-md bg-brand-canvas px-2 py-0.5 font-mono text-[11px] font-semibold text-brand-slate border border-brand-line">
                      {profile.documentType.toUpperCase()}: {profile.documentNumber}
                    </span>
                    <span className="text-brand-line">•</span>
                    <span className="font-medium text-brand-slate">
                      {locale === "es" ? "Nacionalidad" : "Nationality"}: {profile.nationality}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-brand-line flex items-center justify-between">
            <Link
              href={`/${locale}/onboarding?edit=profile`}
              className="text-xs font-semibold text-brand-violet hover:underline"
            >
              {locale === "es" ? "Editar datos de contacto" : "Edit contact details"}
            </Link>

            {!kyc?.approved && (
              <Link
                href={`/${locale}/circles/new`}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-brand-violet px-4 text-xs font-semibold text-brand-white hover:bg-brand-violet-ink transition-colors"
              >
                <span>{locale === "es" ? "Verificar identidad" : "Verify identity"}</span>
                <ExternalLink className="size-3" />
              </Link>
            )}
          </div>
        </div>

        {/* Card 2: ICS Trust Score (5 cols) */}
        <div className="rounded-[32px] border border-brand-navy bg-brand-navy p-6 text-brand-white shadow-sm sm:p-8 lg:col-span-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-white/10 px-3 py-1 text-xs font-semibold text-brand-mint">
                <TrendingUp className="size-3 text-brand-mint" />
                <span>{t.account.creditScoreTitle}</span>
              </span>
              <Award className="size-5 text-brand-mint" />
            </div>

            <div className="mt-6">
              <p className="font-mono text-5xl font-extrabold tracking-tight text-brand-mint tabular-nums">
                {icsScore !== null ? `${icsScore}` : "—"}
              </p>
              <p className="mt-1 text-sm font-semibold text-brand-white">{icsDisplay}</p>
              <p className="mt-2 text-xs text-brand-on-navy leading-relaxed">
                {t.account.creditScoreHelp}
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl bg-brand-white/5 p-4 border border-brand-white/10 text-xs text-brand-on-navy">
            <p className="flex items-center gap-1.5 font-semibold text-brand-mint">
              <Zap className="size-3.5" />
              <span>Safe Round Engine</span>
            </p>
            <p className="mt-1 leading-relaxed">
              {locale === "es"
                ? "Cada aporte verificado en la red Interledger suma a tu solvencia comunitaria sin reportes negativos ni cobros usureros."
                : "Every verified payment over Interledger strengthens your community credit score without predatory payday terms."}
            </p>
          </div>
        </div>

        {/* Card 3: Open Payments Wallet (6 cols) */}
        <div className="rounded-[32px] border border-brand-line bg-brand-white p-6 shadow-2xs sm:p-8 lg:col-span-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 rounded-full bg-brand-canvas px-3 py-1 text-xs font-semibold text-brand-slate">
                <Wallet className="size-3.5 text-brand-violet" />
                <span>{t.account.walletTitle}</span>
              </span>

              {walletAddr ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-mint/40 border border-brand-mint px-3 py-1 text-xs font-semibold text-brand-navy">
                  <span className="size-1.5 rounded-full bg-emerald-600 animate-pulse" />
                  <span>{t.account.walletStatusActive}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 border border-destructive/20 px-3 py-1 text-xs font-semibold text-destructive">
                  <span>{t.account.walletStatusNone}</span>
                </span>
              )}
            </div>

            <div className="mt-6">
              <p className="text-xs font-medium text-brand-slate">{t.account.walletBalance}</p>
              <p className="mt-1 font-mono text-3xl font-bold tracking-tight text-brand-navy tabular-nums">
                {balanceFormatted}
              </p>

              {walletAddr && (
                <div className="mt-4 rounded-2xl bg-brand-canvas p-3 border border-brand-line/80">
                  <p className="text-[11px] font-medium text-brand-slate mb-1">
                    {locale === "es" ? "Dirección Interledger vinculada" : "Linked Interledger Address"}
                  </p>
                  <code className="block font-mono text-xs text-brand-navy break-all font-semibold">
                    {walletAddr}
                  </code>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-brand-line flex items-center justify-between">
            <Link
              href={`/${locale}/onboarding?edit=wallet`}
              className="text-xs font-semibold text-brand-violet hover:underline"
            >
              {locale === "es" ? "Vincular otra billetera" : "Link different wallet"}
            </Link>
          </div>
        </div>

        {/* Card 4: Invitations waiting for the user (12 cols) */}
        <div className="lg:col-span-12">
          <MyInvitesCard locale={locale} invites={invitations} t={t.myInvites} />
        </div>

        {/* Card 5: Savings Activity Summary (6 cols) */}
        <div className="rounded-[32px] border border-brand-line bg-brand-white p-6 shadow-2xs sm:p-8 lg:col-span-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 rounded-full bg-brand-canvas px-3 py-1 text-xs font-semibold text-brand-slate">
                <CheckCircle2 className="size-3.5 text-brand-mint" />
                <span>{t.account.myCirclesTitle}</span>
              </span>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4">
              <div className="rounded-2xl border border-brand-line bg-brand-canvas p-4 text-center">
                <p className="font-mono text-3xl font-extrabold text-brand-navy tabular-nums">
                  {activeCount}
                </p>
                <p className="mt-1 text-xs font-medium text-brand-slate">
                  {fill(t.account.activeCirclesCount, { count: activeCount })}
                </p>
              </div>

              <div className="rounded-2xl border border-brand-line bg-brand-canvas p-4 text-center">
                <p className="font-mono text-3xl font-extrabold text-brand-navy tabular-nums">
                  {completedCount}
                </p>
                <p className="mt-1 text-xs font-medium text-brand-slate">
                  {fill(t.account.completedCirclesCount, { count: completedCount })}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-brand-line flex items-center justify-between">
            <Link
              href={`/${locale}/circles`}
              className="text-xs font-semibold text-brand-navy hover:text-brand-violet flex items-center gap-1 transition-colors"
            >
              <span>{locale === "es" ? "Ir a mis círculos" : "Go to my circles"}</span>
              <ArrowRight className="size-3" />
            </Link>

            <Link
              href={`/${locale}/circles/new`}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-brand-navy px-4 text-xs font-semibold text-brand-white hover:bg-brand-navy/90 transition-colors"
            >
              <Plus className="size-3.5" />
              <span>{t.nav.create}</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
