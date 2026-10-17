import type { Request, RequestHandler, Response } from "express";
import { verifyCredentials } from "@supabase/server/core";
import { AppError } from "../errors/app-error";

function bearerToken(header: string | undefined): string | null {
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

// Verifies the Supabase Auth JWT (Authorization: Bearer <token>) and exposes
// the caller's claims as `res.locals.user`.
async function authenticate(req: Request, res: Response): Promise<void> {
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
}

export const requireUser: RequestHandler = async (req, res, next) => {
  await authenticate(req, res);
  next();
};

// For routes that are public but show more to a signed-in caller: no token → anonymous,
// a token that doesn't verify → 401 (never silently treated as anonymous).
export const optionalUser: RequestHandler = async (req, res, next) => {
  if (req.get("authorization") !== undefined) await authenticate(req, res);
  next();
};

/** Id of the caller authenticated by `requireUser`; 401 if the middleware did not run. */
export function authUserId(res: Response): string {
  const user = res.locals.user;
  if (!user) throw new AppError(401, "UNAUTHORIZED", "Unauthorized");
  return user.id;
}
