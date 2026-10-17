import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { AppError } from "../errors/app-error";
import { requireUser } from "../middleware/require-user";
import type { MemberService } from "../services/member.service";

export const memberParamsSchema = z.strictObject({ id: z.uuid() });

export type MemberParams = z.infer<typeof memberParamsSchema>;

/** Member profiles for signed-in users: "Ana G.", payment record, circles and reviews received. */
export function memberRoutes(members: MemberService): Router {
  const getMember: RequestHandler = async (req, res) => {
    // A malformed id can't match any member: same answer as an unknown one.
    const params = memberParamsSchema.safeParse(req.params);
    if (!params.success) throw new AppError(404, "MEMBER_NOT_FOUND", "Member not found");
    const { id }: MemberParams = params.data;
    res.json(await members.get(id));
  };

  return Router().use(requireUser).get("/:id", getMember);
}
