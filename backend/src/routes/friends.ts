import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { AppError } from "../errors/app-error";
import { perUserRateLimit } from "../middleware/rate-limit";
import { requireUser } from "../middleware/require-user";
import type { FriendService } from "../services/friend.service";
import { currentUserId, emailSchema, pathId } from "./shared";

// Who to befriend: a user the caller can see (a circle mate, an invitee...), or an exact email.
export const friendTargetSchema = z.union([z.strictObject({ userId: z.uuid() }), z.strictObject({ email: emailSchema })]);
export const friendParamsSchema = z.strictObject({ userId: z.uuid() });

export type FriendTargetBody = z.infer<typeof friendTargetSchema>;

const requestId = (id: unknown) => pathId(id, () => new AppError(404, "FRIEND_REQUEST_NOT_FOUND", "Friend request not found"));
// An unknown or malformed id is the same as a user who isn't a friend.
const friendId = (id: unknown) => pathId(id, () => new AppError(404, "FRIEND_NOT_FOUND", "Friend not found"));

export function friendRoutes(friends: FriendService): Router {
  const list: RequestHandler = async (_req, res) => {
    res.json(await friends.list(currentUserId(res)));
  };

  const listRequests: RequestHandler = async (_req, res) => {
    res.json(await friends.requests(currentUserId(res)));
  };

  const request: RequestHandler = async (req, res) => {
    const target: FriendTargetBody = friendTargetSchema.parse(req.body);
    res.status(201).json(await friends.request(currentUserId(res), target));
  };

  const accept: RequestHandler = async (req, res) => {
    res.json(await friends.accept(currentUserId(res), requestId(req.params.id)));
  };

  const cancel: RequestHandler = async (req, res) => {
    await friends.cancel(currentUserId(res), requestId(req.params.id));
    res.status(204).end();
  };

  const remove: RequestHandler = async (req, res) => {
    await friends.remove(currentUserId(res), friendId(req.params.userId));
    res.status(204).end();
  };

  return Router()
    .use(requireUser)
    .get("/", list)
    .get("/requests", listRequests)
    // Requests by email reveal whether an address has an account; keep them slow.
    .post("/requests", perUserRateLimit({ limit: 10 }), request)
    .post("/requests/:id/accept", accept)
    .delete("/requests/:id", cancel)
    .delete("/:userId", remove);
}
