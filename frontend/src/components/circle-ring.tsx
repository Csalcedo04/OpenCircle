import { cn } from "@/lib/utils"

export type RingSeat = {
  id: string
  initials: string
  label: string
  state: "verified" | "pending"
  beneficiary: boolean
}

type Props = {
  seats: RingSeat[]
  /** 0–100, share of the pot collected. */
  progress: number
  amount: string
  caption: string
  title: string
  className?: string
}

const C = 230
const R = 160
const SEAT = 28
const CORE = 96

/**
 * The circle itself: members as seats around the pot. A seat fills in when its
 * payment is verified, and a line carries it into the pot. The beneficiary of
 * the round wears an outer ring.
 */
export function CircleRing({ seats, progress, amount, caption, title, className }: Props) {
  const points = seats.map((seat, i) => {
    const angle = (i / seats.length) * Math.PI * 2 - Math.PI / 2
    return { seat, x: C + R * Math.cos(angle), y: C + R * Math.sin(angle), angle }
  })

  return (
    <svg viewBox="0 0 460 460" role="img" aria-label={title} className={cn("h-auto w-full", className)}>
      <title>{title}</title>
      <circle cx={C} cy={C} r={R} fill="none" className="stroke-brand-cool-steel" strokeWidth={2} />
      <circle
        cx={C}
        cy={C}
        r={R}
        fill="none"
        pathLength={100}
        strokeDasharray={`${progress} 100`}
        strokeLinecap="round"
        transform={`rotate(-90 ${C} ${C})`}
        className="stroke-brand-baltic-blue"
        strokeWidth={6}
      />

      {points
        .filter(({ seat }) => seat.state === "verified")
        .map(({ seat, angle }, i) => (
          <line
            key={`spoke-${seat.id}`}
            x1={C + (R - SEAT - 6) * Math.cos(angle)}
            y1={C + (R - SEAT - 6) * Math.sin(angle)}
            x2={C + (CORE + 6) * Math.cos(angle)}
            y2={C + (CORE + 6) * Math.sin(angle)}
            pathLength={1}
            className="ring-spoke stroke-brand-baltic-blue"
            strokeWidth={2}
            style={{ animationDelay: `${i * 90}ms` }}
          />
        ))}

      <circle cx={C} cy={C} r={CORE} className="fill-brand-deep-space-blue" />
      <text x={C} y={C - 4} textAnchor="middle" className="fill-brand-white-smoke font-heading text-[26px] font-semibold">
        {amount}
      </text>
      <text x={C} y={C + 26} textAnchor="middle" className="fill-brand-cool-steel text-[15px]">
        {caption}
      </text>

      {points.map(({ seat, x, y }) => (
        <g key={seat.id}>
          <title>{seat.label}</title>
          {seat.beneficiary && (
            <circle cx={x} cy={y} r={SEAT + 8} fill="none" className="stroke-brand-deep-space-blue" strokeWidth={3} />
          )}
          <circle
            cx={x}
            cy={y}
            r={SEAT}
            className={
              seat.state === "verified"
                ? "fill-brand-baltic-blue stroke-brand-baltic-blue"
                : "fill-brand-white-smoke stroke-brand-grey"
            }
            strokeWidth={2}
            strokeDasharray={seat.state === "verified" ? undefined : "5 5"}
          />
          <text
            x={x}
            y={y + 6}
            textAnchor="middle"
            className={cn(
              "text-[17px] font-semibold",
              seat.state === "verified" ? "fill-brand-white-smoke" : "fill-brand-deep-space-blue",
            )}
          >
            {seat.initials}
          </text>
        </g>
      ))}
    </svg>
  )
}
