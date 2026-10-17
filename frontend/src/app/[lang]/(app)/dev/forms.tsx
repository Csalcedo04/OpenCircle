"use client"

import { useActionState } from "react"
import { FastForward, RefreshCw } from "lucide-react"
import { FormField, describedBy } from "@/components/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import { CIRCLE_CADENCES } from "@/lib/api/test-clocks"
import { advanceClockAction, createClockAction, createClockCircleAction, joinCircleAction, type DevState } from "./actions"

type T = Dictionary["devClock"]
const initial: DevState = { error: null }
const selectClass = "h-11 w-full rounded-lg border border-input bg-brand-white px-3 text-base"

function FormError({ state, t }: { state: DevState; t: T }) {
  return state.error ? (
    <p role="alert" className="text-sm font-medium text-brand-violet-ink">
      {t.errors[state.error]}
    </p>
  ) : null
}

export function CreateClockForm({ locale, t, defaultStart }: { locale: Locale; t: T; defaultStart: string }) {
  const [state, action, pending] = useActionState(createClockAction.bind(null, locale), initial)
  return (
    <form action={action} className="space-y-5">
      <FormField id="name" label={t.name}>
        <Input id="name" name="name" required maxLength={80} defaultValue="demo" className="h-11 text-base" />
      </FormField>
      <FormField id="start" label={t.start}>
        <Input id="start" name="start" type="datetime-local" required defaultValue={defaultStart} className="h-11 text-base" />
      </FormField>
      <FormError state={state} t={t} />
      <Button type="submit" disabled={pending} className="h-11 px-5 text-base">
        {pending ? t.creating : t.create}
      </Button>
    </form>
  )
}

/** "Advance one period" (to the next boundary) or "Refresh" (to the clock's own time). */
export function AdvanceButton({ locale, t, clockId, to, kind }: { locale: Locale; t: T; clockId: string; to: string; kind: "advance" | "refresh" }) {
  const [state, action, pending] = useActionState(advanceClockAction.bind(null, locale, clockId, to), initial)
  const Icon = kind === "advance" ? FastForward : RefreshCw
  return (
    <form action={action} className="space-y-2">
      <Button type="submit" variant={kind === "advance" ? "default" : "outline"} disabled={pending} className="h-11 px-5 text-base">
        <Icon aria-hidden="true" />
        {kind === "advance" ? (pending ? t.advancing : t.advance) : pending ? t.refreshing : t.refresh}
      </Button>
      <FormError state={state} t={t} />
    </form>
  )
}

export function ClockCircleForm({ locale, t, clockId }: { locale: Locale; t: T; clockId: string }) {
  const [state, action, pending] = useActionState(createClockCircleAction.bind(null, locale, clockId), initial)
  const bad = (f: NonNullable<DevState["fields"]>[number]) => (state.fields?.includes(f) ? t.errors.invalid : undefined)
  return (
    <form action={action} className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      <FormField id="circle-name" label={t.circleName} error={bad("name")}>
        <Input id="circle-name" name="name" required maxLength={80} defaultValue="Natillera demo" aria-describedby={describedBy("circle-name", bad("name"))} className="h-11 text-base" />
      </FormField>
      <FormField id="city" label={t.city} error={bad("city")}>
        <Input id="city" name="city" required maxLength={80} defaultValue="Medellín" className="h-11 text-base" />
      </FormField>
      <FormField id="contributionValue" label={t.amount} help={t.amountHelp} error={bad("contributionValue")}>
        <Input
          id="contributionValue"
          name="contributionValue"
          inputMode="numeric"
          required
          defaultValue="500"
          aria-describedby={describedBy("contributionValue", bad("contributionValue"))}
          className="h-11 text-base tabular-nums"
        />
      </FormField>
      <FormField id="size" label={t.size} error={bad("size")}>
        <Input id="size" name="size" type="number" min={2} max={50} required defaultValue={3} className="h-11 text-base" />
      </FormField>
      <FormField id="cadence" label={t.cadence} error={bad("cadence")}>
        <select id="cadence" name="cadence" defaultValue="MONTHLY" className={selectClass}>
          {CIRCLE_CADENCES.map((c) => (
            <option key={c} value={c}>
              {t.cadences[c]}
            </option>
          ))}
        </select>
      </FormField>
      <div className="space-y-2 sm:col-span-2">
        <FormError state={state} t={t} />
        <Button type="submit" disabled={pending} className="h-11 px-5 text-base">
          {t.createCircle}
        </Button>
      </div>
    </form>
  )
}

export function JoinForm({ locale, t, circleId, invite }: { locale: Locale; t: T; circleId: string; invite: string | undefined }) {
  const [state, action, pending] = useActionState(joinCircleAction.bind(null, locale, circleId, invite), initial)
  return (
    <form action={action} className="space-y-4">
      <FormError state={state} t={t} />
      <Button type="submit" disabled={pending} className="h-11 px-5 text-base">
        {pending ? t.joining : t.join}
      </Button>
    </form>
  )
}
