import { z } from "zod";

export const walletAddressQuerySchema = z.object({
  // https only: the server fetches this URL, so plain http would widen SSRF exposure.
  url: z.url({ protocol: /^https$/ }),
});

export type WalletAddressQuery = z.infer<typeof walletAddressQuerySchema>;
