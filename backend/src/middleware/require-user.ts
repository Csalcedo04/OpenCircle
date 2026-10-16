import type { RequestHandler } from "express";
import { verifyCredentials } from "@supabase/server/core";
import { AppError } from "../errors/app-error";

function bearerToken(header: string | undefined): string | null {
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

// Verifies the Supabase Auth JWT (Authorization: Bearer <token>) and exposes
// the caller's claims as `res.locals.user`.
export const requireUser: RequestHandler = async (req, res, next) => {
  const credentials = {
    token: bearerToken(req.get("authorization")),
    apikey: req.get("apikey") ?? null,
  };

  const { data, error } = await verifyCredentials(credentials, { auth: "user" });
  if (error) {
    // 500 means the server is misconfigured (e.g. no JWKS), not a bad token.
    const message = error.status === 401 ? "Unauthorized" : "Authentication unavailable";
    throw new AppError(error.status, error.code, message);
  }
  if (!data.userClaims) {
    throw new AppError(401, "UNAUTHORIZED", "Unauthorized");
  }

  res.locals.user = data.userClaims;
  next();
};
