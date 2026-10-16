import type { RequestHandler } from "express";
import { AppError } from "../errors/app-error";
import { authUserId } from "../middleware/require-user";
import { updateProfileSchema } from "../schemas/user.schema";
import type { UserService } from "../services/user.service";

export function createUserController(users: UserService) {
  const getMe: RequestHandler = async (_req, res) => {
    const user = await users.findById(authUserId(res));
    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "User profile not found");
    }
    res.json(user);
  };

  const updateMe: RequestHandler = async (req, res) => {
    const patch = updateProfileSchema.parse(req.body);
    res.json(await users.updateProfile(authUserId(res), patch));
  };

  return { getMe, updateMe };
}
