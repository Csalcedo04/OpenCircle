import { Router } from "express";
import { createUserController } from "../controllers/user.controller";
import { requireUser } from "../middleware/require-user";
import type { UserService } from "../services/user.service";

export function userRoutes(service: UserService): Router {
  const controller = createUserController(service);
  return Router().get("/me", requireUser, controller.getMe);
}
