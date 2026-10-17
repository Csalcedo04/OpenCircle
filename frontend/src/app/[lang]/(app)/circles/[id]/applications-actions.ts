"use server"

import { revalidatePath } from "next/cache"
import { applyToCircle, voteOnApplication, BackendError } from "@/lib/api/backend"
import type { GrantMode, VoteDecision } from "@/lib/domain/types"

export type ApplicationActionResult = {
  ok: boolean
  error?: string
}

export async function submitApplicationAction(
  circleId: string,
  locale: string,
  seat: { payoutRound: number; collateralValue: string; grant: GrantMode },
): Promise<ApplicationActionResult> {
  try {
    await applyToCircle(circleId, seat)
    revalidatePath(`/${locale}/circles/${circleId}`)
    return { ok: true }
  } catch (err) {
    const message = err instanceof BackendError ? err.message : "Error al enviar la postulación"
    return { ok: false, error: message }
  }
}

export async function castVoteAction(
  circleId: string,
  applicationId: string,
  decision: VoteDecision,
  locale: string,
): Promise<ApplicationActionResult> {
  try {
    await voteOnApplication(circleId, applicationId, decision)
    revalidatePath(`/${locale}/circles/${circleId}`)
    return { ok: true }
  } catch (err) {
    const message = err instanceof BackendError ? err.message : "Error al registrar el voto"
    return { ok: false, error: message }
  }
}
