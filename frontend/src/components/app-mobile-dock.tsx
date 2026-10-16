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
      label: "Interledger",
      icon: CircleDot,
      isActive: false,
    },
    {
      href: `/${locale}#seguridad`,
      label: "Seguridad",
      icon: ShieldCheck,
      isActive: false,
    },
  ]

  return (
    <aside
      aria-label="Navegación móvil del demo"
      className="fixed inset-x-3 bottom-3 z-40 block pb-[max(0.25rem,env(safe-area-inset-bottom))] md:hidden"
    >
      <nav className="mx-auto flex max-w-md items-center justify-around gap-1 rounded-full border border-brand-navy/10 bg-brand-navy/95 px-3 py-2 shadow-[0_16px_40px_-10px_rgba(16,24,40,0.65)] backdrop-blur-xl">
        {items.map(({ href, label, icon: Icon, isActive, highlight }) => {
          if (highlight) {
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-xs font-semibold shadow-xs outline-none transition-transform duration-150 active:scale-95",
                  isActive
                    ? "bg-brand-mint text-brand-navy ring-2 ring-brand-white"
                    : "bg-brand-violet text-brand-white hover:bg-brand-violet-ink focus-visible:ring-2 focus-visible:ring-brand-mint",
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span>{label}</span>
              </Link>
            )
          }

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center justify-center rounded-full px-3 py-1 text-[11px] font-medium outline-none transition-all duration-150 active:scale-90",
                isActive
                  ? "text-brand-mint"
                  : "text-brand-on-navy hover:text-brand-white focus-visible:ring-2 focus-visible:ring-brand-mint",
              )}
            >
              <Icon className={cn("size-4 shrink-0", isActive && "stroke-[2.5px]")} />
              <span className="mt-0.5 max-w-[65px] truncate tracking-tight">{label}</span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
