import { z } from "zod";
import { KYC_STATUSES } from "../lib/didit";

export const startKycSchema = z.strictObject({
  locale: z.enum(["en", "es"]),
  // Where the user returns after Didit; an in-app path only, so it can't become an open redirect.
  returnPath: z.string().max(200).regex(/^\/(en|es)(\/[\w-]+)*$/),
});

export type StartKycInput = z.infer<typeof startKycSchema>;

// Fields we act on; everything else in the payload (including any decision data) is ignored.
export const diditWebhookSchema = z.object({
  session_id: z.uuid(),
  status: z.enum(KYC_STATUSES),
  vendor_data: z.string().nullable().optional(),
});
