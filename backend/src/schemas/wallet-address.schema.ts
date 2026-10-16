import { z } from "zod";

export const walletAddressUrlSchema = z.object({
  // https only: the server fetches this URL, so plain http would widen SSRF exposure.
  url: z.url({ protocol: /^https$/ }),
});

export type WalletAddressUrl = z.infer<typeof walletAddressUrlSchema>;

// Accepts a payment pointer (`$ilp.example/alice`) or its https form; yields the https URL.
export const walletAddressInputSchema = z.object({
  url: z
    .string()
    .trim()
    .transform((v) => (v.startsWith("$") ? `https://${v.slice(1)}` : v))
    .pipe(z.url({ protocol: /^https$/ })),
});
