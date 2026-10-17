import type { RequestHandler } from "express";

/**
 * One JSON line per request once the response is sent. Path only: query strings can carry
 * invite tokens, and bodies can carry PII, so neither is logged.
 */
export const requestLog: RequestHandler = (req, res, next) => {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const errorCode: unknown = res.locals.errorCode;
    console.log(
      JSON.stringify({
        at: new Date().toISOString(),
        method: req.method,
        path: req.originalUrl.split("?")[0],
        status: res.statusCode,
        ms: Number((process.hrtime.bigint() - start) / 1_000_000n),
        ...(typeof errorCode === "string" ? { error: errorCode } : {}),
      }),
    );
  });
  next();
};
