import { CIRCLE_CADENCES, type CircleCadence, type NewCircle, type TestClock } from "@/lib/api/test-clocks"

/** Dev pages exist only when the server runs with TEST_CLOCKS_ENABLED=true. */
export const testClocksEnabled = (env: Record<string, string | undefined> = process.env): boolean => env.TEST_CLOCKS_ENABLED === "true"

/** "Advance one period": the earliest next period start or deadline across the clock's circles. */
export function nextBoundary(clock: Pick<TestClock, "circles">): string | null {
  const times = clock.circles.flatMap((c) => (c.nextBoundary ? [c.nextBoundary] : []))
  return times.sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null
}

/** Payout rounds nobody has taken yet, in order. */
export function freePayoutRounds(size: number, taken: readonly { payoutRound: number }[]): number[] {
  const used = new Set(taken.map((s) => s.payoutRound))
  return Array.from({ length: size }, (_, i) => i + 1).filter((n) => !used.has(n))
}

export type ClockCircleField = "name" | "city" | "contributionValue" | "size" | "cadence"

/** The create-circle form's text fields → API input, or the fields that are wrong. */
export function parseClockCircleForm(
  fields: Record<ClockCircleField, string>,
  testClockId: string,
): { ok: true; circle: NewCircle } | { ok: false; errors: ClockCircleField[] } {
  const errors: ClockCircleField[] = []
  const name = fields.name.trim()
  const city = fields.city.trim()
  if (name.length < 1 || name.length > 80) errors.push("name")
  if (city.length < 1 || city.length > 80) errors.push("city")
  // Minor units: an integer string, never a float.
  if (!/^[1-9]\d{0,17}$/.test(fields.contributionValue.trim())) errors.push("contributionValue")
  const size = Number(fields.size)
  if (!Number.isInteger(size) || size < 2 || size > 50) errors.push("size")
  const cadence = CIRCLE_CADENCES.find((c) => c === fields.cadence)
  if (!cadence) errors.push("cadence")
  if (errors.length > 0 || !cadence) return { ok: false, errors }
  return {
    ok: true,
    circle: { name, city, contributionValue: fields.contributionValue.trim(), size, cadence: cadence satisfies CircleCadence, testClockId },
  }
}

/** `<input type="datetime-local">` value, read as UTC → ISO; null if it isn't a date. */
export function utcFromLocalInput(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
  const ms = Date.parse(`${value}:00Z`)
  return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}
