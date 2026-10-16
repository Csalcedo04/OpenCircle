/** Header name: the profile's name, else the email's local part (the API may be unreachable). */
export function headerName(fullName: string | null | undefined, email: unknown): string {
  const name = fullName?.trim()
  if (name) return name
  return typeof email === "string" ? (email.split("@")[0] ?? "") : ""
}
