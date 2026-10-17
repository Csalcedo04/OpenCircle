"use server"

import { revalidatePath } from "next/cache"
import { hasLocale } from "@/i18n/config"
import { BackendError, voteOnApplication, type ApplicationDto, type VoteDecision } from "@/lib/api/backend"
import { circleErrorKey, type CircleErrorKey } from "@/lib/flows/circles"

export type VoteState = {
  error: CircleErrorKey | null
  /** The application as the API returns it after the vote: real counts and status. */
  application: ApplicationDto | null
}

// Bound per row and decision: React's previous state and form data aren't needed.
export async function castVoteAction(locale: string, circleId: string, applicationId: string, decision: VoteDecision): Promise<VoteState> {
  if (!hasLocale(locale)) return { error: "generic", application: null }
  try {
    const application = await voteOnApplication(circleId, applicationId, decision)
    revalidatePath(`/${locale}/circles/${circleId}`)
    return { error: null, application }
  } catch (err) {
    const code = err instanceof BackendError ? err.code : "unknown"
    console.error("Application vote failed", code)
    return { error: circleErrorKey(code), application: null }
  }
}
