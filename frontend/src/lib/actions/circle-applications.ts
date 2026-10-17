"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { hasLocale } from "@/i18n/config"
import { BackendError, setCircleApprovers, voteOnApplication, type ApplicationDto, type VoteDecision } from "@/lib/api/backend"
import { circleErrorKey, type CircleErrorKey } from "@/lib/flows/circles"

const memberIdsSchema = z.array(z.uuid()).max(50)
// A Server Action is an HTTP endpoint: everything it gets is checked, not trusted from the client.
const voteInputSchema = z.object({ circleId: z.uuid(), applicationId: z.uuid(), decision: z.enum(["ACCEPT", "REJECT"]) })

export type VoteState = {
  error: CircleErrorKey | null
  /** The application as the API returns it after the vote: real counts and status. */
  application: ApplicationDto | null
}

// Bound per row and decision: React's previous state and form data aren't needed.
export async function castVoteAction(locale: string, circleId: string, applicationId: string, decision: VoteDecision): Promise<VoteState> {
  if (!hasLocale(locale)) return { error: "generic", application: null }
  const input = voteInputSchema.safeParse({ circleId, applicationId, decision })
  if (!input.success) return { error: "generic", application: null }
  try {
    const application = await voteOnApplication(input.data.circleId, input.data.applicationId, input.data.decision)
    revalidatePath(`/${locale}/circles/${circleId}`)
    return { error: null, application }
  } catch (err) {
    const code = err instanceof BackendError ? err.code : "unknown"
    console.error("Application vote failed", code)
    return { error: circleErrorKey(code), application: null }
  }
}

export type ApproversState = {
  error: CircleErrorKey | null
  saved: boolean
}

export async function setCircleApproversAction(
  locale: string,
  circleId: string,
  memberIds: readonly string[],
): Promise<ApproversState> {
  if (!hasLocale(locale)) return { error: "generic", saved: false }
  const parsed = memberIdsSchema.safeParse(memberIds)
  if (!parsed.success) return { error: "generic", saved: false }
  try {
    await setCircleApprovers(circleId, parsed.data)
    revalidatePath(`/${locale}/circles/${circleId}`)
    return { error: null, saved: true }
  } catch (err) {
    const code = err instanceof BackendError ? err.code : "unknown"
    console.error("Set approvers failed", code)
    return { error: circleErrorKey(code), saved: false }
  }
}

