"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { hasLocale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import { BackendError, advanceTestClock, createCircle, createTestClock, joinCircle } from "@/lib/api/backend"
import { parseClockCircleForm, testClocksEnabled, utcFromLocalInput, type ClockCircleField } from "@/lib/flows/test-clock"

export type DevErrorKey = keyof Dictionary["devClock"]["errors"]
export type DevState = { error: DevErrorKey | null; fields?: ClockCircleField[] }

const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "")

const KNOWN: readonly string[] = [
  "KYC_REQUIRED",
  "SEAT_TAKEN",
  "ALREADY_MEMBER",
  "CIRCLE_NOT_OPEN",
  "TEST_CLOCK_BACKWARDS",
  "BACKEND_UNAVAILABLE",
] satisfies DevErrorKey[]

function failed(what: string, err: unknown): DevState {
  const code = err instanceof BackendError ? err.code : "unknown"
  console.error(`${what} failed`, code)
  return { error: KNOWN.includes(code) ? (code as DevErrorKey) : "generic" }
}

/** Creates a test clock and opens its page. */
export async function createClockAction(locale: string, _prev: DevState, formData: FormData): Promise<DevState> {
  const name = text(formData.get("name"))
  const frozenTime = utcFromLocalInput(text(formData.get("start")))
  if (!testClocksEnabled() || !hasLocale(locale)) return { error: "generic" }
  if (!name || name.length > 80 || !frozenTime) return { error: "invalid" }
  let id: string
  try {
    ;({ id } = await createTestClock({ name, frozenTime }))
  } catch (err) {
    return failed("Test clock create", err)
  }
  redirect(`/${locale}/dev/test-clocks/${id}`)
}

/** Moves the clock to `to` (the next boundary, or its own time to only refresh payments). */
export async function advanceClockAction(locale: string, clockId: string, to: string): Promise<DevState> {
  if (!testClocksEnabled() || !hasLocale(locale)) return { error: "generic" }
  try {
    await advanceTestClock(clockId, to)
  } catch (err) {
    return failed("Test clock advance", err)
  }
  revalidatePath(`/${locale}/dev/test-clocks/${clockId}`)
  return { error: null }
}

export async function createClockCircleAction(locale: string, clockId: string, _prev: DevState, formData: FormData): Promise<DevState> {
  if (!testClocksEnabled() || !hasLocale(locale)) return { error: "generic" }
  const fields = {
    name: text(formData.get("name")),
    city: text(formData.get("city")),
    contributionValue: text(formData.get("contributionValue")),
    size: text(formData.get("size")),
    cadence: text(formData.get("cadence")),
    payoutRound: text(formData.get("payoutRound")),
  }
  const parsed = parseClockCircleForm(fields, clockId)
  if (!parsed.ok) return { error: "invalid", fields: parsed.errors }
  try {
    await createCircle(parsed.circle)
  } catch (err) {
    return failed("Clock circle create", err)
  }
  revalidatePath(`/${locale}/dev/test-clocks/${clockId}`)
  return { error: null }
}

export async function joinCircleAction(locale: string, circleId: string, _prev: DevState, formData: FormData): Promise<DevState> {
  if (!testClocksEnabled() || !hasLocale(locale)) return { error: "generic" }
  const payoutRound = Number(text(formData.get("payoutRound")))
  if (!Number.isInteger(payoutRound) || payoutRound < 1) return { error: "invalid" }
  try {
    await joinCircle(circleId, payoutRound)
  } catch (err) {
    return failed("Circle join", err)
  }
  revalidatePath(`/${locale}/dev/circles/${circleId}`)
  return { error: null }
}
