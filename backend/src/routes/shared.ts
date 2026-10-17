import type { Response } from "express";
import { z } from "zod";
import { AppError } from "../errors/app-error";

// Helpers every route file needs; schemas stay with their routes.

/** A malformed id can't match anything: same answer as an unknown one. */
export function pathId(id: unknown, notFound: () => AppError): string {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) throw notFound();
  return parsed.data;
}

export function currentUserId(res: Response): string {
  const user = res.locals.user;
  if (!user) throw new AppError(401, "UNAUTHORIZED", "Unauthorized");
  return user.id;
}

/** An email as stored on profiles: lowercase. */
export const emailSchema = z.email().transform((email) => email.toLowerCase());
