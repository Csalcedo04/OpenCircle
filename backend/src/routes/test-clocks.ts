import { Router, type RequestHandler, type Response } from "express";
import { z } from "zod";
import { AppError } from "../errors/app-error";
import { requireUser } from "../middleware/require-user";
import type { TestClockService } from "../services/test-clock.service";

// Dev only: mounted when TEST_CLOCKS_ENABLED is on, otherwise these paths are the app's 404.
export const createTestClockSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  frozenTime: z.iso.datetime({ offset: true }).transform((v) => new Date(v)).optional(),
});

export const advanceTestClockSchema = z.strictObject({
  to: z.iso.datetime({ offset: true }).transform((v) => new Date(v)),
});

export type CreateTestClockBody = z.infer<typeof createTestClockSchema>;
export type AdvanceTestClockBody = z.infer<typeof advanceTestClockSchema>;

// A malformed id can't match any clock: same answer as an unknown one.
function clockId(id: unknown): string {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) throw new AppError(404, "TEST_CLOCK_NOT_FOUND", "Test clock not found");
  return parsed.data;
}

function currentUserId(res: Response): string {
  const user = res.locals.user;
  if (!user) throw new AppError(401, "UNAUTHORIZED", "Unauthorized");
  return user.id;
}

export function testClockRoutes(clocks: TestClockService): Router {
  const create: RequestHandler = async (req, res) => {
    const body: CreateTestClockBody = createTestClockSchema.parse(req.body);
    res.status(201).json(await clocks.create(currentUserId(res), body));
  };

  const getOne: RequestHandler = async (req, res) => {
    res.json(await clocks.get(currentUserId(res), clockId(req.params.id)));
  };

  const advance: RequestHandler = async (req, res) => {
    const id = clockId(req.params.id);
    const { to }: AdvanceTestClockBody = advanceTestClockSchema.parse(req.body);
    res.json(await clocks.advance(currentUserId(res), id, to));
  };

  return Router().use(requireUser).post("/", create).get("/:id", getOne).post("/:id/advance", advance);
}
