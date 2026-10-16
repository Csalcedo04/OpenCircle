import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { users, type User } from "../db/schema";

export function createUserService(db: Db) {
  return {
    async findById(id: string): Promise<User | null> {
      const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      return user ?? null;
    },
  };
}

export type UserService = ReturnType<typeof createUserService>;
