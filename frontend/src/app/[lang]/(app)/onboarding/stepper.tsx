import { fill } from "@/i18n/config"
import { cn } from "@/lib/utils"

type Props = {
  /** 1-based current step. */
  current: number
  labels: readonly string[]
  /** "Paso {n} de 2" */
  stepText: string
}

/**
 * Onboarding progress: one segment per step. Arriving on a step fills its segment
 * (the screen's one motion moment); finished steps are solid. With reduced motion
 * the bars are simply full.
 */
export function Stepper({ current, labels, stepText }: Props) {
  return (
    <div>
      <p className="text-sm font-medium text-brand-violet-ink">{fill(stepText, { n: current })}</p>
      <ol className="mt-3 grid grid-cols-2 gap-2">
        {labels.map((label, i) => {
          const n = i + 1
          const state = n < current ? "done" : n === current ? "current" : "upcoming"
          return (
            <li key={label} aria-current={state === "current" ? "step" : undefined} className="min-w-0">
              <div className="h-1.5 overflow-hidden rounded-full bg-brand-line">
                {state !== "upcoming" && (
                  <div className={cn("h-full rounded-full bg-brand-violet", state === "current" && "oc-step-fill")} />
                )}
              </div>
              <p
                className={cn(
                  "mt-2 truncate text-xs font-medium",
                  state === "upcoming" ? "text-muted-foreground" : "text-brand-navy",
                )}
              >
                {label}
              </p>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
