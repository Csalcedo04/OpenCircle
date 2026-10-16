import { z } from "zod";

// Converts a payment pointer ($host/path) or wallet address URL into the https wallet address URL.
// Returns null when the input is not a valid https address. https only: the server fetches it,
// so plain http would widen SSRF exposure.
export function toWalletAddressUrl(input: string): string | null {
  const raw = input.trim();
  const isPointer = raw.startsWith("$");

  let url: URL;
  try {
    url = new URL(isPointer ? `https://${raw.slice(1)}` : raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    return null;
  }
  if (isPointer && url.pathname === "/") {
    url.pathname = "/.well-known/pay";
  }
  return url.href;
}

export const walletAddressInputSchema = z.string().transform((value, ctx) => {
  const url = toWalletAddressUrl(value);
  if (url === null) {
    ctx.addIssue({ code: "custom", message: "Must be a payment pointer ($host/path) or an https wallet address URL" });
    return z.NEVER;
  }
  return url;
});
