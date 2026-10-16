import type { RequestHandler } from "express";
import { AppError } from "../errors/app-error";
import type { UserService } from "../services/user.service";

export function createUserController(service: UserService) {
  const getMe: RequestHandler = async (_req, res) => {
    const authUser = res.locals.user;
    if (!authUser) {
      throw new AppError(401, "UNAUTHORIZED", "Unauthorized");
    }

    const user = await service.findById(authUser.id);
    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "User profile not found");
    }
    res.json(user);
  };

  return { getMe };
}
