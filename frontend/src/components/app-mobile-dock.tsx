"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { CircleDot, PlusCircle, Compass, ShieldCheck } from "lucide-react"
import type { Locale } from "@/i18n/config"
import { cn } from "@/lib/utils"

interface AppMobileDockProps {
  locale: Locale
  t: {
    circles: string
    create: string
    appQuickNavAria?: string
    interledger?: string
    safety?: string
  }
}

export function AppMobileDock({ locale, t }: AppMobileDockProps) {
  const pathname = usePathname()

  const items = [
    {
      href: `/${locale}/circles`,
      label: t.circles,
      icon: Compass,
      isActive: pathname === `/${locale}/circles`,
    },
    {
      href: `/${locale}/circles/new`,
      label: t.create,
      icon: PlusCircle,
      isActive: pathname === `/${locale}/circles/new`,
      highlight: true,
    },
    {
      href: `/${locale}#como-funciona`,
      label: t.interledger ?? "Interledger",
      icon: CircleDot,
      isActive: false,
    },
    {
      href: `/${locale}#seguridad`,
      label: t.safety ?? "Seguridad",
      icon: ShieldCheck,
      isActive: false,
    },
  ]

  return (
    <aside
      aria-label={t.appQuickNavAria ?? "Navegación móvil del demo"}
      className="fixed inset-x-3 bottom-3 z-40 block pb-[max(0.25rem,env(safe-area-inset-bottom))] md:hidden"
    >
      <nav className="mx-auto flex max-w-md items-center justify-around gap-0.5 rounded-full border border-brand-navy/10 bg-brand-navy/95 px-2 py-2 sm:gap-1 sm:px-3 shadow-[0_16px_40px_-10px_color-mix(in_srgb,var(--color-brand-navy)_65%,transparent)] backdrop-blur-xl">
        {items.map(({ href, label, icon: Icon, isActive, highlight }) => {
          if (highlight) {
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-semibold shadow-xs outline-none transition-transform duration-150 active:scale-95 min-[360px]:px-4",
                  isActive
                    ? "bg-brand-mint text-brand-navy ring-2 ring-brand-white"
                    : "bg-brand-violet text-brand-white hover:bg-brand-violet-ink focus-visible:ring-2 focus-visible:ring-brand-mint",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {/* Icon only on the narrowest phones so the dock fits at 320px. */}
                <span className="max-[359px]:sr-only">{label}</span>
              </Link>
            )
          }

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex min-w-0 flex-col items-center justify-center rounded-full px-1.5 py-1 text-[11px] min-[360px]:px-3 font-medium outline-none transition-all duration-150 active:scale-90",
                isActive
                  ? "text-brand-mint"
                  : "text-brand-on-navy hover:text-brand-white focus-visible:ring-2 focus-visible:ring-brand-mint",
              )}
            >
              <Icon className={cn("size-4 shrink-0", isActive && "stroke-[2.5px]")} />
              <span className="mt-0.5 max-w-[60px] truncate tracking-tight">{label}</span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
