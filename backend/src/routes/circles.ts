import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { AppError } from "../errors/app-error";
import { APPLICATION_STATUSES, APPROVAL_MODES, CIRCLE_STATUSES, GRANT_MODES, VOTE_DECISIONS } from "../db/schema";
import { requireKyc } from "../middleware/require-kyc";
import { authUserId, requireUser } from "../middleware/require-user";
import type { CircleService } from "../services/circle.service";
import type { ApplicationService } from "../services/circles/application.service";
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
    roundLengthDays: z.int().min(1).max(365),
    approvalMode: z.enum(APPROVAL_MODES).default("DELEGATES"),
    ...seatFields,
  })
  .refine((c) => c.payoutRound <= c.size, { path: ["payoutRound"], message: "Must be between 1 and size" });

// Seat preferences; without a payout round the applicant gets the next free one when accepted.
export const applySchema = z.strictObject({ ...seatFields, payoutRound: seatFields.payoutRound.nullable().default(null) });

export const voteSchema = z.strictObject({ decision: z.enum(VOTE_DECISIONS) });

export const setApproversSchema = z.strictObject({ memberIds: z.array(z.uuid()).max(50) });

export const listCirclesQuerySchema = z.object({ status: z.enum(CIRCLE_STATUSES).optional() });

export const listApplicationsQuerySchema = z.strictObject({ status: z.enum(APPLICATION_STATUSES).optional() });

export type CreateCircleBody = z.infer<typeof createCircleSchema>;
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

export function circleRoutes({ circles, applications, kyc }: CircleRouteServices): Router {
  // Browsing is public; creating and applying need a signed-in, KYC-approved user.
  const list: RequestHandler = async (req, res) => {
    const { status } = listCirclesQuerySchema.parse(req.query);
    res.json(await circles.list({ status }));
  };

  const getOne: RequestHandler = async (req, res) => {
    res.json(await circles.get(circleId(req.params.id)));
  };

  const create: RequestHandler = async (req, res) => {
    const body: CreateCircleBody = createCircleSchema.parse(req.body);
    res.status(201).json(await circles.create(authUserId(res), body));
  };

  const apply: RequestHandler = async (req, res) => {
    const id = circleId(req.params.id);
    const body: ApplyBody = applySchema.parse(req.body);
    res.status(201).json(await applications.apply(authUserId(res), id, body));
  };

  const listApplications: RequestHandler = async (req, res) => {
    const id = circleId(req.params.id);
    const { status } = listApplicationsQuerySchema.parse(req.query);
    res.json(await applications.list(authUserId(res), id, status));
  };

  const vote: RequestHandler = async (req, res) => {
    const id = circleId(req.params.id);
    const appId = applicationId(req.params.applicationId);
    const { decision }: VoteBody = voteSchema.parse(req.body);
    res.json(await applications.vote(authUserId(res), id, appId, decision));
  };

  const setApprovers: RequestHandler = async (req, res) => {
    const id = circleId(req.params.id);
    const { memberIds }: SetApproversBody = setApproversSchema.parse(req.body);
    res.json(await applications.setApprovers(authUserId(res), id, memberIds));
  };

  const verified = [requireUser, requireKyc(kyc)];
  return Router()
    .get("/", list)
    .get("/:id", getOne)
    .post("/", ...verified, create)
    .post("/:id/applications", ...verified, apply)
    .get("/:id/applications", requireUser, listApplications)
    .post("/:id/applications/:applicationId/votes", requireUser, vote)
    .put("/:id/approvers", requireUser, setApprovers);
}
