import express, { type Express } from "express";
import { errorHandler, notFound } from "./middleware/error-handler";
import { apiRoutes, type Services } from "./routes";
import { internalRoutes } from "./routes/internal";
import { webhookRoutes } from "./routes/webhooks";

export interface AppOptions {
  diditWebhookSecret: string | undefined;
  // Shared secret of the scheduler calling /api/internal; without it those jobs answer 503.
  cronSecret?: string | undefined;
}

export function createApp(services: Services, options: AppOptions): Express {
  const app = express();
  app.disable("x-powered-by");
  // Before express.json(): webhook signatures need the raw body.
  app.use("/api/webhooks", webhookRoutes(services.kyc, options.diditWebhookSecret));
  app.use("/api/internal", internalRoutes(services.circleTick, options.cronSecret));
  app.use(express.json({ limit: "100kb" }));

  app.use("/api", apiRoutes(services));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
