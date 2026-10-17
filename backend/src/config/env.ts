import { envSchema, type Env } from "./env-schema";

export type { Env };

export const env: Env = envSchema.parse(process.env);
