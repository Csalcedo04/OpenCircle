import type { ErrorRequestHandler, RequestHandler } from "express";
import { OpenPaymentsClientError } from "@interledger/open-payments";
import { ZodError } from "zod";
import { AppError } from "../errors/app-error";

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new AppError(404, "NOT_FOUND", "Route not found"));
};

// Client errors raised by express.json() (malformed JSON, body too large) carry a 4xx status
// and `expose: true`, meaning their message is safe to return.
function isExposedClientError(err: unknown): err is { status: number; message: string } {
  if (typeof err !== "object" || err === null) return false;
  const { status, expose } = err as { status?: unknown; expose?: unknown };
  return expose === true && typeof status === "number" && status >= 400 && status < 500;
}

function errorCode(err: unknown): string {
  if (isExposedClientError(err)) return "INVALID_REQUEST_BODY";
  if (err instanceof AppError) return err.code;
  if (err instanceof ZodError) return "VALIDATION_ERROR";
  if (err instanceof OpenPaymentsClientError) return "OPEN_PAYMENTS_ERROR";
  return "INTERNAL_ERROR";
}

export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
  // Picked up by the request log.
  res.locals.errorCode = errorCode(err);
  if (isExposedClientError(err)) {
    res.status(err.status).json({ error: { code: "INVALID_REQUEST_BODY", message: err.message } });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof ZodError) {
    const issues = err.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid request", issues } });
    return;
  }
  if (err instanceof OpenPaymentsClientError) {
    // Upstream wallet / auth server failure; details may contain URLs or tokens, so they stay out of the response.
    console.error("Open Payments error", { status: err.status, code: err.code, description: err.description });
    res.status(502).json({ error: { code: "OPEN_PAYMENTS_ERROR", message: "Upstream Open Payments request failed" } });
    return;
  }

  console.error("Unhandled error", err instanceof Error ? err.name : typeof err);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
};
