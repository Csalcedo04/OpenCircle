import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { getDictionary } from "@/i18n/get-dictionary"
import { cn } from "@/lib/utils"

export default async function NotFound() {
  const { locale, t } = await getDictionary()
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="font-heading text-3xl font-semibold">{t.common.notFoundTitle}</h1>
      <p className="mt-2 text-muted-foreground">{t.common.notFoundBody}</p>
      <Link href={`/${locale}/circles`} className={cn(buttonVariants({ size: "lg" }), "mt-6 h-11 px-5 text-base")}>
        {t.common.goCircles}
      </Link>
    </div>
  )
}
