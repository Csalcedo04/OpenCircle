import { z } from "zod"

// Dev only (TEST_CLOCKS_ENABLED): API shapes for test clocks and API-backed circles.
// Plain schemas, no server-only: the fetch functions live in backend.ts.

const amountSchema = z.object({ value: z.string(), assetCode: z.string(), assetScale: z.int() })

export const CIRCLE_CADENCES = ["WEEKLY", "MONTHLY"] as const
export type CircleCadence = (typeof CIRCLE_CADENCES)[number]

export const apiCircleSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  city: z.string(),
  status: z.string(),
  contribution: amountSchema,
  size: z.int(),
  seatsTaken: z.int(),
  cadence: z.enum(CIRCLE_CADENCES),
  startedAt: z.string().nullable(),
  testClockId: z.uuid().nullable(),
  seats: z.array(z.object({ memberId: z.uuid(), displayName: z.string(), payoutRound: z.int() })),
})

export type ApiCircle = z.infer<typeof apiCircleSchema>

const clockMemberSchema = z.object({ memberId: z.uuid(), displayName: z.string(), status: z.string(), failureCode: z.string().nullable() })

export const testClockSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  frozenTime: z.string(),
  circles: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      status: z.string(),
      cadence: z.enum(CIRCLE_CADENCES),
      size: z.int(),
      seatsTaken: z.int(),
      currentPeriod: z
        .object({
          number: z.int(),
          state: z.string(),
          startsAt: z.string(),
          deadline: z.string(),
          beneficiary: z.object({ memberId: z.uuid(), displayName: z.string() }),
          contributions: z.array(clockMemberSchema),
        })
        .nullable(),
      nextBoundary: z.string().nullable(),
    }),
  ),
})

export type TestClock = z.infer<typeof testClockSchema>

export interface NewCircle {
  name: string
  city: string
  /** Minor units, integer string. */
  contributionValue: string
  size: number
  cadence: CircleCadence
  payoutRound: number
  testClockId: string
}

