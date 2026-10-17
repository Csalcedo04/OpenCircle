import Link from "next/link"
import { CloudOff } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import type { Dictionary } from "@/i18n/dictionaries/en"

type Props = {
  t: Pick<Dictionary["common"], "unavailableTitle" | "unavailableBody" | "retry">
  /** The page to reload. */
  retryHref: string
}

/** Shown instead of the error page when the API can't be reached; the user did nothing wrong. */
export function ServiceUnavailable({ t, retryHref }: Props) {
  return (
    <section
      role="status"
      className="relative isolate max-w-xl overflow-hidden rounded-3xl border border-brand-line bg-brand-white p-6 shadow-sm sm:p-8"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-35 select-none"
      >
        <svg viewBox="0 0 600 220" fill="none" className="h-full w-full">
          <circle cx="510" cy="70" r="110" stroke="var(--color-brand-line)" strokeWidth="1.2" strokeDasharray="5 7" />
          <path d="M 220 200 Q 380 40 580 140" stroke="var(--color-brand-violet)" strokeWidth="1.2" strokeDasharray="4 6" />
        </svg>
      </div>
      <div className="flex items-center gap-3 text-brand-navy">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-violet/10 text-brand-violet-ink">
          <CloudOff className="size-5 shrink-0" aria-hidden="true" />
        </span>
        <h2 className="font-heading text-xl font-semibold tracking-[-0.02em]">{t.unavailableTitle}</h2>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-brand-slate">{t.unavailableBody}</p>
      <Link href={retryHref} className={buttonVariants({ className: "mt-6 h-11 rounded-full px-6 text-sm font-semibold" })}>
        {t.retry}
      </Link>
    </section>
  )
}
