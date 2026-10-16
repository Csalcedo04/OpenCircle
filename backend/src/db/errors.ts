// Drizzle wraps driver errors; the postgres-js error (SQLSTATE + constraint) is in `cause`.
interface PostgresErrorLike {
  code?: unknown;
  constraint_name?: unknown;
}

// Returns the violated constraint name for a unique violation (23505), otherwise null.
export function uniqueViolation(err: unknown): string | null {
  const cause: unknown = err instanceof Error ? err.cause : undefined;
  if (typeof cause !== "object" || cause === null) return null;
  const { code, constraint_name } = cause as PostgresErrorLike;
  if (code !== "23505") return null;
  return typeof constraint_name === "string" ? constraint_name : "";
}
