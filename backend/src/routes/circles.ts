import { Router, type RequestHandler, type Response } from "express";
import { z } from "zod";
import { AppError } from "../errors/app-error";
import {
  APPLICATION_STATUSES,
  APPROVAL_MODES,
  CIRCLE_CADENCES,
  CIRCLE_STATUSES,
  CIRCLE_VISIBILITIES,
  GRANT_MODES,
  PAYOUT_ORDERS,
  VOTE_DECISIONS,
} from "../db/schema";
import { requireKyc } from "../middleware/require-kyc";
import { optionalUser, requireUser } from "../middleware/require-user";
import type { CircleService } from "../services/circle.service";
import type { ApplicationService } from "../services/circles/application.service";
import type { KycService } from "../services/kyc.service";

// Money in the asset's minor unit as an integer string: never a float. 18 digits stays within bigint.
const minorUnits = (min: "zero" | "positive") =>
  z
    .string()
    .regex(min === "zero" ? /^(0|[1-9]\d{0,17})$/ : /^[1-9]\d{0,17}$/, "Must be an integer amount in minor units")
    .transform((v) => BigInt(v));

// No payout round: the circle's payout order assigns rounds by score when it starts.
const seatFields = {
  collateralValue: minorUnits("zero").default(0n),
  grantMode: z.enum(GRANT_MODES).nullable().default(null),
};

// Strict objects: unknown keys (status, feeBps, poolWallet...) are rejected, never silently stored.
export const createCircleSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  city: z.string().trim().min(1).max(80).optional(),
  contributionValue: minorUnits("positive"),
  size: z.int().min(2).max(50),
  // One period per member; each period is one or two calendar weeks, or a calendar month.
  cadence: z.enum(CIRCLE_CADENCES),
  // Dev only: rejected with 404 unless test clocks are enabled and the user owns the clock.
  testClockId: z.uuid().optional(),
  // Private (invite only) by default.
  visibility: z.enum(CIRCLE_VISIBILITIES).default("PRIVATE"),
  // Who accepts applicants to a public circle.
  approvalMode: z.enum(APPROVAL_MODES).default("DELEGATES"),
  // Who receives the pot first, by reliability score; members agree to it by joining.
  payoutOrder: z.enum(PAYOUT_ORDERS).default("BEST_SCORE_FIRST"),
  ...seatFields,
});

// The invite code from a private circle's link (base64url); bounded so it can't be used to send huge input.
const inviteCode = z.string().min(1).max(128);

export const joinCircleSchema = z.strictObject({ ...seatFields, invite: inviteCode.optional() });

export const listCirclesQuerySchema = z.object({ status: z.enum(CIRCLE_STATUSES).optional() });

export const getCircleQuerySchema = z.object({ invite: inviteCode.optional() });

export const visibilitySchema = z.strictObject({ visibility: z.enum(CIRCLE_VISIBILITIES) });

// Seat preferences, copied to the seat when the application is accepted.
export const applySchema = z.strictObject(seatFields);

export const voteSchema = z.strictObject({ decision: z.enum(VOTE_DECISIONS) });

export const setApproversSchema = z.strictObject({ memberIds: z.array(z.uuid()).max(50) });

export const listApplicationsQuerySchema = z.strictObject({ status: z.enum(APPLICATION_STATUSES).optional() });

export type CreateCircleBody = z.infer<typeof createCircleSchema>;
export type JoinCircleBody = z.infer<typeof joinCircleSchema>;
export type VisibilityBody = z.infer<typeof visibilitySchema>;
export type ApplyBody = z.infer<typeof applySchema>;
export type VoteBody = z.infer<typeof voteSchema>;
export type SetApproversBody = z.infer<typeof setApproversSchema>;

export interface CircleRouteServices {
  circles: CircleService;
  applications: ApplicationService;
  kyc: KycService;
}

// A malformed id can't match anything: same answer as an unknown one.
function pathId(id: unknown, notFound: () => AppError): string {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) throw notFound();
  return parsed.data;
}

const circleId = (id: unknown) => pathId(id, () => new AppError(404, "CIRCLE_NOT_FOUND", "Circle not found"));
const applicationId = (id: unknown) =>
  pathId(id, () => new AppError(404, "APPLICATION_NOT_FOUND", "Application not found"));

function currentUserId(res: Response): string {
  const user = res.locals.user;
  if (!user) throw new AppError(401, "UNAUTHORIZED", "Unauthorized");
  return user.id;
}

export function circleRoutes({ circles, applications, kyc }: CircleRouteServices): Router {
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

  // Public circles: apply, and the circle's approvers (or majority) decide.
  const apply: RequestHandler = async (req, res) => {
    const id = circleId(req.params.id);
    const body: ApplyBody = applySchema.parse(req.body);
    res.status(201).json(await applications.apply(currentUserId(res), id, body));
  };

  const listApplications: RequestHandler = async (req, res) => {
    const id = circleId(req.params.id);
    const { status } = listApplicationsQuerySchema.parse(req.query);
    res.json(await applications.list(currentUserId(res), id, status));
  };

  const vote: RequestHandler = async (req, res) => {
    const id = circleId(req.params.id);
    const appId = applicationId(req.params.applicationId);
    const { decision }: VoteBody = voteSchema.parse(req.body);
    res.json(await applications.vote(currentUserId(res), id, appId, decision));
  };

  const setApprovers: RequestHandler = async (req, res) => {
    const id = circleId(req.params.id);
    const { memberIds }: SetApproversBody = setApproversSchema.parse(req.body);
    res.json(await applications.setApprovers(currentUserId(res), id, memberIds));
  };

  const verified = [requireUser, requireKyc(kyc)];
  return Router()
    .get("/", list)
    .get("/:id", optionalUser, getOne)
    .post("/", ...verified, create)
    .post("/:id/join", ...verified, join)
    .patch("/:id/visibility", requireUser, setVisibility)
    .post("/:id/invite-code", requireUser, rotateInvite)
    .post("/:id/applications", ...verified, apply)
    .get("/:id/applications", requireUser, listApplications)
    .post("/:id/applications/:applicationId/votes", requireUser, vote)
    .put("/:id/approvers", requireUser, setApprovers);
}
