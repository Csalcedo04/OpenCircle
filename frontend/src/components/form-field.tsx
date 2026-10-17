import type { ReactNode } from "react"

type Props = {
  id: string
  label: string
  help?: string | undefined
  error?: string | undefined
  children: ReactNode
}

/** Label + control + help/error, wired with aria-describedby by id convention. */
export function FormField({ id, label, help, error, children }: Props) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="oc-fade-in text-sm font-medium text-brand-violet-ink">
          {error}
        </p>
      ) : help ? (
        <p id={`${id}-help`} className="text-sm text-muted-foreground">
          {help}
        </p>
      ) : null}
    </div>
  )
}

export function describedBy(id: string, error?: string): string {
  return error ? `${id}-error` : `${id}-help`
}
