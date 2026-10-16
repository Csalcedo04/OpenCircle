import type { RequestHandler } from "express";
import { AppError } from "../errors/app-error";
import type { KycService } from "../services/kyc.service";

/**
 * After requireUser: only users whose identity Didit approved may pass. KYC can only
 * start once onboarding (profile + wallet) is done, so approved also means onboarded.
 */
export function requireKyc(kyc: Pick<KycService, "getStatus">): RequestHandler {
  return async (_req, res, next) => {
    const user = res.locals.user;
    if (!user) throw new AppError(401, "UNAUTHORIZED", "Unauthorized");
    const { approved } = await kyc.getStatus(user.id);
    if (!approved) throw new AppError(403, "KYC_REQUIRED", "Verify your identity to create or join circles");
    next();
  };
}
