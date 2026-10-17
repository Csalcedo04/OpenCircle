/** Cookie that carries "where to go after sign-in and onboarding" across redirects. */
export const RETURN_PATH_COOKIE = "oc_return_to"
// Onboarding plus identity verification can take a while; the cookie only holds an in-app path.
export const RETURN_PATH_MAX_AGE = 60 * 60 * 24

// In-app paths only (`/es/circles/abc/join`), so a return path can never become an open redirect.
// The one query allowed is an invite token, so an invited user keeps it through sign-in and KYC.
const IN_APP_PATH = /^\/(en|es)(\/[\w-]+)*(\?invite=[\w-]{1,128})?$/
const INVITE_TOKEN = /^[\w-]{1,128}$/

export function isInAppPath(value: unknown): value is string {
  return typeof value === "string" && value.length <= 400 && IN_APP_PATH.test(value)
}

/** `path` with `?invite=` appended when there is a well-formed token to carry. */
export function withInvite(path: string, invite: string | undefined): string {
  return invite !== undefined && INVITE_TOKEN.test(invite) ? `${path}?invite=${invite}` : path
}
