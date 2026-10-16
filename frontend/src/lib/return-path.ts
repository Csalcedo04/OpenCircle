/** Cookie that carries "where to go after sign-in and onboarding" across redirects. */
export const RETURN_PATH_COOKIE = "oc_return_to"
export const RETURN_PATH_MAX_AGE = 60 * 30

// In-app paths only (`/es/circles/abc/join`), so a return path can never become an open redirect.
const IN_APP_PATH = /^\/(en|es)(\/[\w-]+)*$/

export function isInAppPath(value: unknown): value is string {
  return typeof value === "string" && value.length <= 200 && IN_APP_PATH.test(value)
}
