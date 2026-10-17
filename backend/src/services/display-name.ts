/** "Ana María Gómez" → "Ana G.": how members appear to each other, never the full legal name. */
export function displayName(fullName: string | null): string {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return "—";
  const last = parts.length > 1 ? parts[parts.length - 1] : undefined;
  return last ? `${first} ${last.charAt(0).toUpperCase()}.` : first;
}
