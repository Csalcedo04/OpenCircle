import { z } from "zod";

export const updateProfileSchema = z
  .strictObject({
    fullName: z.string().trim().min(1).max(120).optional(),
    // E.164, e.g. +573001234567
    phone: z.string().regex(/^\+[1-9]\d{6,14}$/, "Phone must be in E.164 format").optional(),
    dob: z.iso.date().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), "At least one field is required");

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
