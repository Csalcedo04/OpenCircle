import Link from "next/link"
import { Compass } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { getDictionary } from "@/i18n/get-dictionary"
import { cn } from "@/lib/utils"

export default async function NotFound() {
  const { locale, t } = await getDictionary()
  return (
    <div className="mx-auto max-w-xl px-4 py-16 sm:py-24">
      <div className="relative isolate overflow-hidden rounded-[32px] border border-brand-line bg-brand-white p-8 text-center shadow-2xs sm:p-10">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-40 select-none">
          <svg viewBox="0 0 600 280" fill="none" className="h-full w-full">
            <circle cx="300" cy="140" r="110" stroke="var(--color-brand-line)" strokeWidth="1.5" strokeDasharray="5 7" />
            <circle cx="300" cy="140" r="175" stroke="color-mix(in srgb, var(--color-brand-violet) 25%, transparent)" strokeWidth="1" />
          </svg>
        </div>
        <span className="mx-auto inline-flex size-12 items-center justify-center rounded-2xl bg-brand-violet/12 text-brand-violet-ink">
          <Compass className="size-6" aria-hidden="true" />
        </span>
        <h1 className="mt-4 font-heading text-2xl font-bold tracking-tight text-brand-navy sm:text-3xl">{t.common.notFoundTitle}</h1>
        <p className="mt-2 text-sm leading-relaxed text-brand-slate">{t.common.notFoundBody}</p>
        <Link href={`/${locale}/circles`} className={cn(buttonVariants({ size: "lg" }), "mt-6 h-11 rounded-full bg-brand-violet px-6 text-sm font-semibold text-brand-white hover:bg-brand-violet-ink")}>
          {t.common.goCircles}
        </Link>
      </div>
    </div>
  )
}
