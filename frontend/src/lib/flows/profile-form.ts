import { z } from "zod"
import type { Dictionary } from "@/i18n/dictionaries/en"
import type { NewProfile, ProfilePatch } from "@/lib/api/backend"
import { DOCUMENT_TYPES, type DocumentType } from "@/lib/domain/identity"

export type ProfileErrorKey = keyof Dictionary["onboarding"]["errors"]
export const PROFILE_FIELDS = ["fullName", "phone", "dob", "nationality", "documentType", "documentNumber"] as const
export type ProfileField = (typeof PROFILE_FIELDS)[number]
export type ProfileFormFields = Record<ProfileField, string>

// Mirrors the API's rules so each field gets its own message; the API validates again.
const today = () => new Date().toISOString().slice(0, 10)
const editable = {
  fullName: z.string().min(1, "fullName").max(200, "fullName"),
  phone: z.string().regex(/^\+[1-9]\d{6,14}$/, "phone"),
  dob: z.iso.date("dob").refine((d) => d <= today(), "dob"),
  nationality: z.string().toUpperCase().regex(/^[A-Z]{2}$/, "nationality"),
}
const documentPattern: Record<DocumentType, RegExp> = {
  cc: /^\d{3,15}$/,
  ti: /^\d{3,15}$/,
  ce: /^\d{3,15}$/,
  pp: /^[A-Z0-9]{5,20}$/,
}
const newProfileSchema = z
  .object({ ...editable, documentType: z.enum(DOCUMENT_TYPES, "documentType"), documentNumber: z.string().toUpperCase() })
  .refine((p) => documentPattern[p.documentType].test(p.documentNumber), { path: ["documentNumber"], message: "documentNumber" })
const patchSchema = z.object(editable)

export type ParsedProfile =
  | { ok: true; mode: "create"; profile: NewProfile }
  | { ok: true; mode: "update"; patch: ProfilePatch }
  | { ok: false; errors: Partial<Record<ProfileField, ProfileErrorKey>> }

/**
 * Validates the onboarding profile form. The first save creates the profile (identity
 * included); later saves only update the editable fields, so the document is ignored.
 */
export function parseProfileForm(fields: ProfileFormFields, mode: "create" | "update"): ParsedProfile {
  const parsed = mode === "create" ? newProfileSchema.safeParse(fields) : patchSchema.safeParse(fields)
  if (!parsed.success) {
    const errors: Partial<Record<ProfileField, ProfileErrorKey>> = {}
    for (const issue of parsed.error.issues) {
      const field = issue.path[0]
      if (typeof field === "string" && (PROFILE_FIELDS as readonly string[]).includes(field)) {
        errors[field as ProfileField] ??= field as ProfileField
      }
    }
    return { ok: false, errors }
  }
  if (mode === "create") return { ok: true, mode, profile: newProfileSchema.parse(fields) }
  const { fullName, phone, dob, nationality } = patchSchema.parse(fields)
  return { ok: true, mode, patch: { fullName, phone, dob, nationality } }
}

const profileErrors: Record<string, ProfileErrorKey> = {
  DOCUMENT_IN_USE: "documentInUse",
  EMAIL_IN_USE: "emailInUse",
  EMAIL_REQUIRED: "emailRequired",
}

/** API error code from saving the profile → message key. */
export const profileErrorKey = (code: string): ProfileErrorKey => profileErrors[code] ?? "generic"
