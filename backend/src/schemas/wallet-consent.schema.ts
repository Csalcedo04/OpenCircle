import { z } from "zod";

// Query values from the wallet's redirect, forwarded by the frontend callback page.
export const completeConsentSchema = z.strictObject({
  state: z.string().regex(/^[\w-]{32,128}$/),
  interactRef: z.string().min(1).max(512),
  hash: z.string().min(1).max(512),
});

export type CompleteConsentInput = z.infer<typeof completeConsentSchema>;
