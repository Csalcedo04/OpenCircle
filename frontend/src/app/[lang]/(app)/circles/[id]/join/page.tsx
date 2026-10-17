import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { ArrowLeft, ShieldCheck } from "lucide-react"
import { KycGate } from "@/components/kyc-gate"
import { fill } from "@/i18n/config"
import { getDictionary } from "@/i18n/get-dictionary"
import { getCircleView } from "@/lib/data"
import { withInvite } from "@/lib/return-path"
import { JoinCircleForm } from "./join-circle-form"

export async function generateMetadata({ params }: PageProps<"/[lang]/circles/[id]/join">): Promise<Metadata> {
  const { t } = await getDictionary()
  const view = await getCircleView((await params).id)
  return { title: view ? fill(t.join.title, { circle: view.circle.name }) : "OpenCircle" }
}

export default async function JoinPage({ params, searchParams }: PageProps<"/[lang]/circles/[id]/join">) {
  const { id } = await params
  // A private circle's link carries ?invite=; it's needed to see and join it.
  const { invite } = await searchParams
  const inviteCode = typeof invite === "string" ? invite : undefined
  const { locale, t } = await getDictionary()
  const view = await getCircleView(id, inviteCode)
  if (!view) notFound()
  const { circle, access } = view
  // The API says whether the viewer's link seats them; otherwise a public circle takes an application.
  const mode = access.canJoin ? "join" : "apply"
  // A private circle seen through someone else's invite, or a member: nothing to do here.
  const admitted = access.canJoin || (mode === "apply" && access.visibility === "PUBLIC" && !access.isMember)

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href={`/${locale}/circles/${circle.id}`}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-slate transition-colors hover:text-brand-navy"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        <span>{circle.name}</span>
      </Link>

      <header className="relative isolate mt-4 overflow-hidden rounded-[32px] sm:rounded-[40px] border border-brand-line bg-brand-white p-6 shadow-[0_24px_48px_-28px_color-mix(in_srgb,var(--color-brand-navy)_18%,transparent)] sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-45 select-none">
          <svg viewBox="0 0 1200 320" fill="none" className="h-full w-full">
            <circle cx="1040" cy="110" r="180" stroke="var(--color-brand-line)" strokeWidth="1.5" strokeDasharray="5 7" />
            <circle cx="1040" cy="110" r="275" stroke="color-mix(in srgb, var(--color-brand-violet) 25%, transparent)" strokeWidth="1" />
            <path d="M 560 290 Q 840 30 1180 180" stroke="color-mix(in srgb, var(--color-brand-mint) 65%, transparent)" strokeWidth="2" strokeDasharray="4 6" />
          </svg>
        </div>

        <span className="inline-flex items-center gap-2 rounded-full border border-brand-line bg-brand-canvas px-3 py-1 text-xs font-semibold text-brand-navy">
          <ShieldCheck className="size-3.5 text-brand-violet" aria-hidden="true" />
          <span>GNAP · Safe Round Engine</span>
        </span>
        <h1 className="mt-3 font-heading text-3xl font-bold tracking-[-0.03em] text-brand-navy sm:text-5xl">
          {fill(mode === "apply" ? t.join.applyTitle : t.join.title, { circle: circle.name })}
        </h1>
        <p className="mt-2 max-w-[65ch] text-sm leading-relaxed text-brand-slate sm:text-base">
          {mode === "apply" ? t.join.applyLead : t.join.lead}
        </p>
      </header>

      <div className="mt-8">
        {!admitted ? (
          <p role="status" className="rounded-[32px] border border-brand-line bg-brand-white p-8 text-center text-sm text-brand-slate">
            {access.isMember ? t.join.alreadyMember : t.join.notAdmitted}
          </p>
        ) : (
          <Suspense fallback={<p className="text-sm text-brand-slate">{t.common.loading}</p>}>
            <KycGate locale={locale} t={t.kyc} tc={t.common} returnPath={withInvite(`/${locale}/circles/${circle.id}/join`, inviteCode)}>
              <JoinCircleForm
                locale={locale}
                circle={circle}
                mode={mode}
                invite={inviteCode}
                t={t.join}
                tErr={t.circleErrors}
                tc={{
                  owes: t.circle.owes,
                  collateral: t.circle.collateral,
                  grant: t.circle.grant,
                  uncovered: t.circle.uncovered,
                  threshold: t.circle.threshold,
                  eligible: t.circle.eligible,
                }}
                notCovered={t.join.notCovered}
              />
            </KycGate>
          </Suspense>
        )}
      </div>
    </div>
  )
}
