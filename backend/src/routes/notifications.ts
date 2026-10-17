import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { AppError } from "../errors/app-error";
import { requireUser } from "../middleware/require-user";
import type { NotificationService } from "../services/notification.service";
import { currentUserId, pathId } from "./shared";

// What waits for the signed-in user: friend requests and circle invites. Read-only except read markers.
export const listNotificationsQuerySchema = z.strictObject({
  unread: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

const notificationId = (id: unknown) => pathId(id, () => new AppError(404, "NOTIFICATION_NOT_FOUND", "Notification not found"));

export function notificationRoutes(notifications: NotificationService): Router {
  const list: RequestHandler = async (req, res) => {
    const { unread, limit }: ListNotificationsQuery = listNotificationsQuerySchema.parse(req.query);
    res.json(await notifications.list(currentUserId(res), { unreadOnly: unread === "true", limit }));
  };

  const markRead: RequestHandler = async (req, res) => {
    res.json(await notifications.markRead(currentUserId(res), notificationId(req.params.id)));
  };

  const markAllRead: RequestHandler = async (_req, res) => {
    res.json({ read: await notifications.markAllRead(currentUserId(res)) });
  };

  return Router()
    .use(requireUser)
    .get("/", list)
    .post("/read-all", markAllRead)
    .post("/:id/read", markRead);
}
