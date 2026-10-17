import Link from "next/link"
import { Sparkles } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import type { Dictionary } from "@/i18n/dictionaries/en"
import { cn } from "@/lib/utils"

type Props = {
  t: Pick<Dictionary["common"], "featureUnavailableTitle" | "featureUnavailableBody" | "goCircles">
  circlesHref?: string | undefined
  compact?: boolean | undefined
}

/**
 * Shown when the connected API server responds 404 NOT_FOUND ("Route not found")
 * because it is running an earlier deployment that does not expose this route yet.
 */
export function FeatureUnavailable({ t, circlesHref, compact = false }: Props) {
  return (
    <section
      role="status"
      className={cn(
        "rounded-[32px] border border-brand-line bg-brand-white shadow-2xs",
        compact ? "p-5 sm:p-6" : "max-w-xl p-6 sm:p-8",
      )}
    >
      <div className="flex items-center gap-3 text-brand-navy">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-violet/10 text-brand-violet-ink">
          <Sparkles className="size-4.5" aria-hidden="true" />
        </span>
        <h2 className={cn("font-semibold tracking-[-0.02em]", compact ? "text-base" : "text-xl")}>
          {t.featureUnavailableTitle}
        </h2>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-brand-slate">{t.featureUnavailableBody}</p>
      {circlesHref && !compact && (
        <Link href={circlesHref} className={buttonVariants({ className: "mt-6 h-11 rounded-full px-5 text-sm font-semibold" })}>
          {t.goCircles}
        </Link>
      )}
    </section>
  )
}
