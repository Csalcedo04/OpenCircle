import {
  CircleCheck,
  CircleDashed,
  Clock,
  Lock,
  Send,
  ShieldQuestion,
  Undo2,
  type LucideIcon,
} from "lucide-react"
import type { RoundStatus } from "@/lib/domain/types"
import { cn } from "@/lib/utils"

const icon: Record<RoundStatus, LucideIcon> = {
  COLLECTING: CircleDashed,
  FUNDED: CircleCheck,
  RISK_CHECK: ShieldQuestion,
  BLOCKED: Lock,
  PAYING_OUT: Send,
  PAID_OUT: CircleCheck,
  REFUNDED: Undo2,
  UPCOMING: Clock,
}

/** Brand palette only: state reads from icon + label, colour just groups it. */
const tone: Record<RoundStatus, string> = {
  COLLECTING: "bg-brand-mint text-brand-navy",
  FUNDED: "bg-brand-violet text-brand-white",
  RISK_CHECK: "bg-brand-mint text-brand-navy",
  BLOCKED: "bg-brand-navy text-brand-white",
  PAYING_OUT: "bg-brand-violet text-brand-white",
  PAID_OUT: "bg-brand-navy text-brand-white",
  REFUNDED: "bg-brand-mint text-brand-navy",
  UPCOMING: "border border-brand-slate text-brand-navy",
}

export function RoundStatusBadge({ status, label, className }: { status: RoundStatus; label: string; className?: string }) {
  const Icon = icon[status]
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", tone[status], className)}>
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </span>
  )
}
