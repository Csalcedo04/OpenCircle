"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { CircleDot, Compass, Plus, UserRound, UsersRound } from "lucide-react"
import type { Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import { cn } from "@/lib/utils"

interface AppMobileDockProps {
  locale: Locale
  t: Pick<
    Dictionary["nav"],
    | "circles"
    | "myCirclesShort"
    | "create"
    | "createShort"
    | "friends"
    | "accountShort"
    | "appQuickNavAria"
  >
}

export function AppMobileDock({ locale, t }: AppMobileDockProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const isNewCircle = pathname.startsWith(`/${locale}/circles/new`)
  const isCirclesList = pathname === `/${locale}/circles`
  const isCircleDetail = pathname.startsWith(`/${locale}/circles/`) && !isNewCircle
  const isMyCirclesTab = isCirclesList && searchParams.get("tab") === "my"

  const leftItems = [
    {
      href: `/${locale}/circles`,
      label: t.circles,
      icon: Compass,
      isActive: (isCirclesList && !isMyCirclesTab) || isCircleDetail,
    },
    {
      href: `/${locale}/circles?tab=my`,
      label: t.myCirclesShort,
      icon: CircleDot,
      isActive: isMyCirclesTab,
    },
  ]

  const rightItems = [
    {
      href: `/${locale}/friends`,
      label: t.friends,
      icon: UsersRound,
      isActive: pathname.startsWith(`/${locale}/friends`),
    },
    {
      href: `/${locale}/account`,
      label: t.accountShort,
      icon: UserRound,
      isActive:
        pathname.startsWith(`/${locale}/account`) ||
        pathname.startsWith(`/${locale}/members`),
    },
  ]

  const renderItem = ({
    href,
    label,
    icon: Icon,
    isActive,
  }: {
    href: string
    label: string
    icon: typeof Compass
    isActive: boolean
  }) => (
    <Link
      key={href}
      href={href}
      aria-current={isActive ? "page" : undefined}
      className="group flex min-h-12 flex-col items-center justify-center gap-1 rounded-2xl py-0.5 outline-none transition-transform duration-150 active:scale-95 focus-visible:ring-2 focus-visible:ring-brand-mint"
    >
      <span
        className={cn(
          "flex h-7 w-10 items-center justify-center rounded-full transition-colors duration-150",
          isActive
            ? "bg-brand-mint/20 text-brand-mint"
            : "text-brand-on-navy group-hover:text-brand-white",
        )}
      >
        <Icon
          className={cn("size-4 shrink-0", isActive ? "stroke-[2.5px]" : "stroke-2")}
          aria-hidden="true"
        />
      </span>
      <span
        className={cn(
          "max-w-[62px] truncate text-[10px] leading-none tracking-tight transition-colors",
          isActive ? "font-bold text-brand-mint" : "font-medium text-brand-on-navy group-hover:text-brand-white",
        )}
      >
        {label}
      </span>
    </Link>
  )

  return (
    <aside
      aria-label={t.appQuickNavAria}
      className="fixed inset-x-3 bottom-3 z-40 block pb-[max(0.25rem,env(safe-area-inset-bottom))] md:hidden"
    >
      <nav className="mx-auto grid max-w-md grid-cols-5 items-end rounded-3xl border border-brand-white/15 bg-brand-navy/95 px-2 pt-1.5 pb-2 shadow-[0_16px_40px_-10px_color-mix(in_srgb,var(--color-brand-navy)_65%,transparent)] backdrop-blur-xl">
        {leftItems.map(renderItem)}

        {/* Central Create Circle CTA (exact same elevated circular centerpiece as Landing MobileDock) */}
        <Link
          href={`/${locale}/circles/new`}
          aria-label={t.create}
          aria-current={isNewCircle ? "page" : undefined}
          className="group flex flex-col items-center justify-end rounded-2xl pb-0.5 outline-none focus-visible:ring-2 focus-visible:ring-brand-mint"
        >
          <span
            className={cn(
              "-mt-5 flex size-12 items-center justify-center rounded-full ring-4 ring-brand-navy transition-transform duration-150 group-hover:scale-105 group-active:scale-95",
              isNewCircle
                ? "bg-brand-violet text-brand-white shadow-[0_10px_24px_-6px_var(--color-brand-violet)]"
                : "bg-brand-mint text-brand-navy shadow-[0_10px_24px_-6px_color-mix(in_srgb,var(--color-brand-mint)_55%,transparent)]",
            )}
          >
            <Plus className="size-5 stroke-[2.5px]" aria-hidden="true" />
          </span>
          <span
            className={cn(
              "mt-1 text-[10px] font-bold leading-none tracking-tight",
              isNewCircle ? "text-brand-white" : "text-brand-mint",
            )}
          >
            {t.createShort}
          </span>
        </Link>

        {rightItems.map(renderItem)}
      </nav>
    </aside>
  )
}
