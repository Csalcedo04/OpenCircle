import type { UserClaims } from "@supabase/server";

declare global {
  namespace Express {
    interface Locals {
      user?: UserClaims;
    }
  }
}

export {};
