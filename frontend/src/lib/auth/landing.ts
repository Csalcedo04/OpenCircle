import "server-only"

import { getMyProfile } from "@/lib/api/backend"
import { isInAppPath } from "@/lib/return-path"

/**
 * Where a user lands right after signing in, decided on the server so onboarded users
 * never see onboarding flash by: their saved return page or circles once onboarded,
 * onboarding otherwise (including when the API can't be reached; onboarding explains it).
 */
export async function landingAfterSignIn(locale: string, returnPath: string | undefined): Promise<string> {
  try {
    const profile = await getMyProfile()
    if (profile?.walletAddress) return isInAppPath(returnPath) ? returnPath : `/${locale}/circles`
  } catch {
    // Fall through to onboarding.
  }
  return `/${locale}/onboarding`
}
