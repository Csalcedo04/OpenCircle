import { Router, type RequestHandler, type Response } from "express";
import { z } from "zod";
import { AppError } from "../errors/app-error";
import { CIRCLE_CADENCES, CIRCLE_STATUSES, CIRCLE_VISIBILITIES, GRANT_MODES } from "../db/schema";
import { requireKyc } from "../middleware/require-kyc";
import { optionalUser, requireUser } from "../middleware/require-user";
import type { CircleService } from "../services/circle.service";
import type { KycService } from "../services/kyc.service";

// Money in the asset's minor unit as an integer string: never a float. 18 digits stays within bigint.
const minorUnits = (min: "zero" | "positive") =>
  z
    .string()
    .regex(min === "zero" ? /^(0|[1-9]\d{0,17})$/ : /^[1-9]\d{0,17}$/, "Must be an integer amount in minor units")
    .transform((v) => BigInt(v));

const seatFields = {
  payoutRound: z.int().min(1),
  collateralValue: minorUnits("zero").default(0n),
  grantMode: z.enum(GRANT_MODES).nullable().default(null),
};

// Strict objects: unknown keys (status, feeBps, poolWallet...) are rejected, never silently stored.
export const createCircleSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(80),
    city: z.string().trim().min(1).max(80),
    contributionValue: minorUnits("positive"),
    size: z.int().min(2).max(50),
    // One period per member; each period is a calendar week or month.
    cadence: z.enum(CIRCLE_CADENCES),
    // Dev only: rejected with 404 unless test clocks are enabled and the user owns the clock.
    testClockId: z.uuid().optional(),
    // Private (invite only) by default.
    visibility: z.enum(CIRCLE_VISIBILITIES).default("PRIVATE"),
    ...seatFields,
  })
  .refine((c) => c.payoutRound <= c.size, { path: ["payoutRound"], message: "Must be between 1 and size" });

// The invite code from a private circle's link (base64url); bounded so it can't be used to send huge input.
const inviteCode = z.string().min(1).max(128);

export const joinCircleSchema = z.strictObject({ ...seatFields, invite: inviteCode.optional() });

export const listCirclesQuerySchema = z.object({ status: z.enum(CIRCLE_STATUSES).optional() });

export const getCircleQuerySchema = z.object({ invite: inviteCode.optional() });

export const visibilitySchema = z.strictObject({ visibility: z.enum(CIRCLE_VISIBILITIES) });

export type CreateCircleBody = z.infer<typeof createCircleSchema>;
export type JoinCircleBody = z.infer<typeof joinCircleSchema>;
export type VisibilityBody = z.infer<typeof visibilitySchema>;

export interface CircleRouteServices {
  circles: CircleService;
  kyc: KycService;
}

// A malformed id can't match any circle: same answer as an unknown one.
function circleId(id: unknown): string {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) throw new AppError(404, "CIRCLE_NOT_FOUND", "Circle not found");
  return parsed.data;
}

function currentUserId(res: Response): string {
  const user = res.locals.user;
  if (!user) throw new AppError(401, "UNAUTHORIZED", "Unauthorized");
  return user.id;
}

export function circleRoutes({ circles, kyc }: CircleRouteServices): Router {
  // Public circles are open to browse; private ones need membership or the invite link.
  // Creating and joining need a signed-in, KYC-approved user.
  const list: RequestHandler = async (req, res) => {
    const { status } = listCirclesQuerySchema.parse(req.query);
    res.json(await circles.list({ status }));
  };

  const getOne: RequestHandler = async (req, res) => {
    const { invite } = getCircleQuerySchema.parse(req.query);
    res.json(await circles.get(circleId(req.params.id), { userId: res.locals.user?.id, invite }));
  };

  const create: RequestHandler = async (req, res) => {
    const body: CreateCircleBody = createCircleSchema.parse(req.body);
    res.status(201).json(await circles.create(currentUserId(res), body));
  };

  const join: RequestHandler = async (req, res) => {
    const id = circleId(req.params.id);
    const { invite, ...seat }: JoinCircleBody = joinCircleSchema.parse(req.body);
    res.json(await circles.join(currentUserId(res), id, seat, invite));
  };

  const setVisibility: RequestHandler = async (req, res) => {
    const id = circleId(req.params.id);
    const { visibility }: VisibilityBody = visibilitySchema.parse(req.body);
    res.json(await circles.setVisibility(currentUserId(res), id, visibility));
  };

  const rotateInvite: RequestHandler = async (req, res) => {
    res.json(await circles.rotateInviteCode(currentUserId(res), circleId(req.params.id)));
  };

  const verified = [requireUser, requireKyc(kyc)];
  return Router()
    .get("/", list)
    .get("/:id", optionalUser, getOne)
    .post("/", ...verified, create)
    .post("/:id/join", ...verified, join)
    .patch("/:id/visibility", requireUser, setVisibility)
    .post("/:id/invite-code", requireUser, rotateInvite);
}
