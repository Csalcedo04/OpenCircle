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
        "inline-grid shrink-0 place-items-center rounded-full font-semibold",
        size === "sm" && "size-7 text-[11px]",
        size === "md" && "size-9 text-xs",
        size === "lg" && "size-11 text-sm",
        tones[tone],
        className,
      )}
    >
      {name.slice(0, 1)}
    </span>
  )
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
