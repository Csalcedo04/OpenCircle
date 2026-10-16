import { Star } from "lucide-react"
import type { TrustSummary } from "@/lib/domain/trust"
import { cn } from "@/lib/utils"

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase()
}

/** Trust score as a small dial: the same circle motif, filled to the score. */
export function TrustDial({ trust, label, size = "sm" }: { trust: TrustSummary; label: string; size?: "sm" | "lg" }) {
  const big = size === "lg"
  return (
    <span className={cn("relative inline-grid place-items-center", big ? "size-28" : "size-11")} role="img" aria-label={`${label}: ${trust.score}/100`}>
      <svg viewBox="0 0 40 40" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
        <circle cx="20" cy="20" r="17" fill="none" className="stroke-brand-line" strokeWidth={3} />
        <circle
          cx="20"
          cy="20"
          r="17"
          fill="none"
          pathLength={100}
          strokeDasharray={`${trust.score} 100`}
          strokeLinecap="round"
          className="stroke-brand-violet"
          strokeWidth={3}
        />
      </svg>
      <span className={cn("font-heading font-semibold tabular-nums", big ? "text-3xl" : "text-sm")}>{trust.score}</span>
    </span>
  )
}

export function Stars({ rating, label }: { rating: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden="true"
          className={cn("size-4", n <= rating ? "fill-brand-violet text-brand-violet-ink" : "text-brand-slate")}
        />
      ))}
    </span>
  )
}

export function formatTenths(tenths: number, locale: "en" | "es"): string {
  const whole = Math.floor(tenths / 10)
  const frac = tenths % 10
  return `${whole}${locale === "es" ? "," : "."}${frac}`
}
