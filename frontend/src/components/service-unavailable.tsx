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
    <section role="status" className="max-w-xl rounded-3xl bg-brand-white p-6 ring-1 ring-brand-line sm:p-8">
      <div className="flex items-center gap-3 text-brand-navy">
        <CloudOff className="size-5 shrink-0 text-brand-violet-ink" aria-hidden="true" />
        <h2 className="text-xl font-semibold tracking-[-0.02em]">{t.unavailableTitle}</h2>
      </div>
      <p className="mt-3 text-muted-foreground">{t.unavailableBody}</p>
      <Link href={retryHref} className={buttonVariants({ className: "mt-6 h-11 px-5 text-base" })}>
        {t.retry}
      </Link>
    </section>
  )
}
