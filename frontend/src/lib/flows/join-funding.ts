import { toBig } from "@/lib/domain/money"
import type { Amount, FundingSource, GrantMode } from "@/lib/domain/types"

/**
 * How a seat pays its contributions. Pure helpers shared by the join form and its action.
 * The OpenCircle account comes first when the user has one; the wallet needs a GNAP grant.
 * API error codes about funding are mapped with the other circle errors in `circles.ts`.
 */

export function defaultFundingSource(available: readonly FundingSource[]): FundingSource | null {
  return available.includes("INTERNAL_ACCOUNT") ? "INTERNAL_ACCOUNT" : available.includes("EXTERNAL_WALLET") ? "EXTERNAL_WALLET" : null
}

/** A grant mode only means something when the wallet pays. */
export function grantModeFor(source: FundingSource, chosen: GrantMode): GrantMode | null {
  return source === "EXTERNAL_WALLET" ? chosen : null
}

/** True when the account can't cover even one contribution yet (a hint, not a block: seats are debited per round). */
export function isBelowContribution(balance: Amount | null, contribution: Amount): boolean {
  if (!balance) return false
  return toBig(balance) < toBig(contribution)
}
