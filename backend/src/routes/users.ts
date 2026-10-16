import { Router, type RequestHandler, type Response } from "express";
import { z } from "zod";
import { AppError } from "../errors/app-error";
import { publicProfileRateLimit } from "../middleware/rate-limit";
import { requireUser } from "../middleware/require-user";
import type { UserClaims } from "@supabase/server";
import { DOCUMENT_TYPES, type DocumentType, type UserService } from "../services/user.service";
import type { KycService } from "../services/kyc.service";
import type { WalletConsentService } from "../services/wallet-consent.service";
import type { WalletService } from "../services/wallet.service";
import { walletAddressInputSchema } from "../services/open-payments/payment-pointer";

const today = (): string => new Date().toISOString().slice(0, 10);

const editableProfileFields = {
  fullName: z.string().trim().min(1).max(200),
  phone: z.e164(),
  dob: z.iso.date().refine((dob) => dob <= today(), "dob cannot be in the future"),
  // ISO 3166-1 alpha-2, e.g. "CO".
  nationality: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Must be an ISO 3166-1 alpha-2 country code"),
};

// cc / ti / ce are numeric; passports are alphanumeric (normalized to upper case).
const documentNumberPattern: Record<DocumentType, RegExp> = {
  cc: /^\d{3,15}$/,
  ti: /^\d{3,15}$/,
  ce: /^\d{3,15}$/,
  pp: /^[A-Z0-9]{5,20}$/,
};

// Strict objects: unknown keys (id, email, opWallet, balance...) are rejected, never silently stored.
export const createProfileSchema = z
  .strictObject({
    ...editableProfileFields,
    documentType: z.enum(DOCUMENT_TYPES),
    documentNumber: z.string().trim().toUpperCase(),
  })
  .superRefine((body, ctx) => {
    if (!documentNumberPattern[body.documentType].test(body.documentNumber)) {
      ctx.addIssue({
        code: "custom",
        path: ["documentNumber"],
        message: body.documentType === "pp" ? "Must be 5-20 letters or digits" : "Must be 3-15 digits",
      });
    }
  });

export const updateProfileSchema = z
  .strictObject(editableProfileFields)
  .partial()
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), "At least one field is required");

// The email comes from the verified Supabase JWT, not from the request body.
const tokenEmailSchema = z.email().transform((email) => email.toLowerCase());

// Starts Open Payments consent on this wallet; the wallet is linked only once the user approves.
export const startConsentSchema = z.strictObject({ walletAddress: walletAddressInputSchema });

// Query values from the wallet's redirect, forwarded by the frontend callback route.
export const completeConsentSchema = z.strictObject({
  state: z.string().regex(/^[\w-]{32,128}$/),
  interactRef: z.string().min(1).max(512),
  hash: z.string().min(1).max(512),
});

export const startKycSchema = z.strictObject({
  locale: z.enum(["en", "es"]),
  // Where the user returns after Didit; an in-app path only, so it can't become an open redirect.
  returnPath: z.string().max(200).regex(/^\/(en|es)(\/[\w-]+)*$/),
});

// Public profile of another user (e.g. a savings-circle applicant), by id or by wallet.
export const publicProfileParamsSchema = z.strictObject({ id: z.uuid() });
export const publicProfileQuerySchema = z.strictObject({ walletAddress: walletAddressInputSchema });

export type CreateProfileBody = z.infer<typeof createProfileSchema>;
export type UpdateProfileBody = z.infer<typeof updateProfileSchema>;
export type StartConsentBody = z.infer<typeof startConsentSchema>;
export type CompleteConsentBody = z.infer<typeof completeConsentSchema>;
export type StartKycBody = z.infer<typeof startKycSchema>;
export type PublicProfileParams = z.infer<typeof publicProfileParamsSchema>;
export type PublicProfileQuery = z.infer<typeof publicProfileQuerySchema>;

export interface UserRouteServices {
  users: UserService;
  wallets: WalletService;
  walletConsent: WalletConsentService;
  kyc: KycService;
}

// requireUser runs at router level, so the claims are always present here.
function currentUser(res: Response): UserClaims {
  const user = res.locals.user;
  if (!user) throw new AppError(401, "UNAUTHORIZED", "Unauthorized");
  return user;
}

const currentUserId = (res: Response): string => currentUser(res).id;

function currentUserEmail(res: Response): string {
  const parsed = tokenEmailSchema.safeParse(currentUser(res).email);
  if (!parsed.success) {
    throw new AppError(400, "EMAIL_REQUIRED", "The Supabase account has no email address");
  }
  return parsed.data;
}

export function userRoutes({ users, wallets, walletConsent, kyc }: UserRouteServices): Router {
  const getMe: RequestHandler = async (_req, res) => {
    res.json(await users.getProfile(currentUserId(res)));
  };

  const createMe: RequestHandler = async (req, res) => {
    const body: CreateProfileBody = createProfileSchema.parse(req.body);
    const email = currentUserEmail(res);
    res.status(201).json(await users.createProfile(currentUserId(res), { ...body, email }));
  };

  const updateMe: RequestHandler = async (req, res) => {
    const body: UpdateProfileBody = updateProfileSchema.parse(req.body);
    res.json(await users.updateProfile(currentUserId(res), body));
  };

  // Returns the wallet's consent URL; the frontend sends the user there.
  const startWalletConsent: RequestHandler = async (req, res) => {
    const { walletAddress }: StartConsentBody = startConsentSchema.parse(req.body);
    res.status(201).json(await walletConsent.start(currentUserId(res), walletAddress));
  };

  const completeWalletConsent: RequestHandler = async (req, res) => {
    const body: CompleteConsentBody = completeConsentSchema.parse(req.body);
    res.json(await walletConsent.complete(currentUserId(res), body));
  };

  const getMyKyc: RequestHandler = async (_req, res) => {
    res.json(await kyc.getStatus(currentUserId(res)));
  };

  // Returns Didit's hosted verification URL; the frontend sends the user there.
  const startMyKyc: RequestHandler = async (req, res) => {
    const body: StartKycBody = startKycSchema.parse(req.body);
    res.status(201).json(await kyc.startSession(currentUserId(res), body));
  };

  // One counter shared by both lookups, so switching between id and wallet doesn't reset it.
  const publicProfileLimit = publicProfileRateLimit();

  const getPublicById: RequestHandler = async (req, res) => {
    const { id }: PublicProfileParams = publicProfileParamsSchema.parse(req.params);
    res.json(await users.getPublicProfile({ id }));
  };

  const getPublicByWallet: RequestHandler = async (req, res) => {
    const { walletAddress }: PublicProfileQuery = publicProfileQuerySchema.parse(req.query);
    res.json(await users.getPublicProfile({ walletAddress }));
  };

  const getMySavings: RequestHandler = async (_req, res) => {
    res.json(await wallets.getSavings(currentUserId(res)));
  };

  return Router()
    .use(requireUser)
    .get("/me", getMe)
    .post("/me", createMe)
    .patch("/me", updateMe)
    .post("/me/wallet/consent", startWalletConsent)
    .post("/me/wallet/consent/complete", completeWalletConsent)
    .get("/me/kyc", getMyKyc)
    .post("/me/kyc/session", startMyKyc)
    .get("/me/savings", getMySavings)
    .get("/public", publicProfileLimit, getPublicByWallet)
    .get("/:id/public", publicProfileLimit, getPublicById);
}
