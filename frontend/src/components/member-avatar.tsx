import { initials } from "@/components/trust"
import { cn } from "@/lib/utils"

const TONES = [
  "bg-brand-navy text-brand-white",
  "bg-brand-violet text-brand-white",
  "bg-brand-mint text-brand-navy border border-brand-mint/60",
  "bg-brand-canvas text-brand-navy border border-brand-line",
  "bg-brand-violet/10 text-brand-violet-ink border border-brand-violet/20",
] as const

export function toneFor(key: string): string {
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash << 5) - hash + key.charCodeAt(i)
  const idx = Math.abs(hash) % TONES.length
  return TONES[idx] ?? TONES[0]
}

interface MemberAvatarProps {
  name: string
  id?: string | undefined
  size?: "xs" | "sm" | "md" | "lg"
  className?: string
}

export function MemberAvatar({ name, id, size = "md", className }: MemberAvatarProps) {
  const letters = initials(name) || "•"
  const toneClass = toneFor(id || name)

  const sizeClasses = {
    xs: "size-6 text-[10px]",
    sm: "size-7.5 text-xs font-semibold",
    md: "size-9 text-xs font-bold",
    lg: "size-11 text-sm font-bold",
  }[size]

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full select-none tabular-nums font-heading shadow-2xs",
        sizeClasses,
        toneClass,
        className,
      )}
      title={name}
      aria-label={name}
    >
      {letters}
    </span>
  )
}
