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
  COLLECTING: "bg-brand-cool-steel/40 text-brand-deep-space-blue",
  FUNDED: "bg-brand-baltic-blue text-brand-white-smoke",
  RISK_CHECK: "bg-brand-cool-steel/40 text-brand-deep-space-blue",
  BLOCKED: "bg-brand-black text-brand-white-smoke",
  PAYING_OUT: "bg-brand-baltic-blue text-brand-white-smoke",
  PAID_OUT: "bg-brand-deep-space-blue text-brand-white-smoke",
  REFUNDED: "bg-brand-cool-steel/40 text-brand-deep-space-blue",
  UPCOMING: "border border-brand-grey text-brand-deep-space-blue",
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
