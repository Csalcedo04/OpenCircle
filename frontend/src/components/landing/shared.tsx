import type { ReactNode } from "react"
import type { Locale } from "@/i18n/config"
import { amount, formatAmount } from "@/lib/domain/money"
import { cn } from "@/lib/utils"

/** Whole Colombian pesos, Intl-formatted: "$ 20.000" (es) / "COP 20,000" (en). */
export function pesos(value: bigint | number, locale: Locale): string {
  return formatAmount(amount(BigInt(value), { assetCode: "COP", assetScale: 0 }), locale)
}

/** Same, with the currency spelled out in Spanish ("$ 20.000 COP"); English already says COP. */
export function pesosLabel(value: bigint | number, locale: Locale): string {
  return locale === "es" ? `${pesos(value, locale)} COP` : pesos(value, locale)
}

/** Sample members used across the product mockups. Not real people. */
export const PEOPLE = [
  { name: "María", tone: "violet" },
  { name: "Andrés", tone: "navy" },
  { name: "Lucía", tone: "mint" },
  { name: "Carlos", tone: "mist" },
  { name: "Juan", tone: "line" },
] as const

const tones = {
  violet: "bg-brand-violet text-brand-white",
  navy: "bg-brand-navy text-brand-white",
  mint: "bg-brand-mint text-brand-navy",
  mist: "bg-brand-mist text-brand-navy ring-1 ring-inset ring-brand-line",
  line: "bg-brand-white text-brand-navy ring-1 ring-inset ring-brand-line",
} as const

export function Avatar({
  name,
  tone,
  size = "md",
  className,
}: {
  name: string
  tone: keyof typeof tones
  size?: "sm" | "md" | "lg"
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full overflow-hidden shadow-2xs",
        size === "sm" && "size-7.5",
        size === "md" && "size-9",
        size === "lg" && "size-11",
        tones[tone],
        className,
      )}
    >
      <PersonSilhouette name={name} />
    </span>
  )
}

function PersonSilhouette({ name }: { name: string }) {
  switch (name) {
    case "María":
      return (
        <svg viewBox="0 0 32 32" fill="none" className="size-full p-0.5" aria-hidden="true">
          <circle cx="16" cy="11" r="5" fill="currentColor" fillOpacity="0.85" />
          <path d="M10 10c0-3.3 2.7-6 6-6s6 2.7 6 6c0 1.2-.4 2.3-1 3.2 1.5 1 2.5 2.8 2.5 4.8 0 .5-.1 1-.2 1.5-1.3-.8-2.8-1.5-4.3-1.5H13c-1.5 0-3 .7-4.3 1.5-.1-.5-.2-1-.2-1.5 0-2 1-3.8 2.5-4.8-.6-.9-1-2-1-3.2z" fill="currentColor" />
          <path d="M7 28c0-5 4-9 9-9s9 4 9 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      )
    case "Andrés":
      return (
        <svg viewBox="0 0 32 32" fill="none" className="size-full p-0.5" aria-hidden="true">
          <path d="M11 11c0-2.8 2.2-5 5-5s5 2.2 5 5v1c0 2.8-2.2 5-5 5s-5-2.2-5-5v-1z" fill="currentColor" fillOpacity="0.85" />
          <path d="M10 8c1-3 3.5-4.5 6-4.5s5 1.5 6 4.5l-1.5 1h-9L10 8z" fill="currentColor" />
          <path d="M6 28c0-5.5 4.5-10 10-10s10 4.5 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      )
    case "Lucía":
      return (
        <svg viewBox="0 0 32 32" fill="none" className="size-full p-0.5" aria-hidden="true">
          <circle cx="16" cy="11.5" r="5" fill="currentColor" fillOpacity="0.85" />
          <path d="M9.5 12c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5v3.5c0 1.5-.8 2.5-2 2.5h-9c-1.2 0-2-1-2-2.5V12z" fill="currentColor" />
          <path d="M7 28c0-5 4-9 9-9s9 4 9 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      )
    case "Carlos":
      return (
        <svg viewBox="0 0 32 32" fill="none" className="size-full p-0.5" aria-hidden="true">
          <circle cx="16" cy="11" r="5" fill="currentColor" fillOpacity="0.85" />
          <path d="M11 7c1-2.5 3-3.5 5-3.5s4 1 5 3.5v2h-10V7z" fill="currentColor" />
          <path d="M13 14c1 1.5 2 2 3 2s2-.5 3-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M6 28c0-5.5 4.5-10 10-10s10 4.5 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      )
    default:
      return (
        <svg viewBox="0 0 32 32" fill="none" className="size-full p-0.5" aria-hidden="true">
          <circle cx="16" cy="11" r="5" fill="currentColor" fillOpacity="0.8" />
          <path d="M7 28c0-5 4-9 9-9s9 4 9 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="3 3" />
        </svg>
      )
  }
}

export function SectionHeading({
  id,
  title,
  lead,
  align = "left",
  className,
  children,
}: {
  id: string
  title: string
  lead?: string
  align?: "left" | "center"
  className?: string
  children?: ReactNode
}) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center", className)}>
      <h2 id={id} className="text-[2rem] leading-[1.08] font-semibold tracking-[-0.03em] text-balance sm:text-5xl">
        {title}
      </h2>
      {lead && <p className="mt-4 text-lg leading-relaxed text-pretty text-brand-slate">{lead}</p>}
      {children}
    </div>
  )
}

/** Primary/secondary pill buttons as link styles, shared by every CTA on the page. */
export const cta = {
  primary:
    "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand-violet px-6 text-[15px] font-semibold text-brand-white shadow-[0_8px_24px_-12px_var(--color-brand-violet)] transition-[transform,box-shadow,background-color] duration-200 outline-none hover:-translate-y-0.5 hover:bg-brand-violet-ink hover:shadow-[0_14px_30px_-14px_var(--color-brand-violet)] focus-visible:ring-4 focus-visible:ring-brand-violet/30 active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
  secondary:
    "inline-flex h-12 items-center justify-center gap-2 rounded-full border border-brand-line bg-brand-white px-6 text-[15px] font-semibold text-brand-navy transition-[transform,border-color] duration-200 outline-none hover:-translate-y-0.5 hover:border-brand-navy/30 focus-visible:ring-4 focus-visible:ring-brand-violet/30 active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
} as const
