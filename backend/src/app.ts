import express, { type Express } from "express";
import { errorHandler, notFound } from "./middleware/error-handler";
import { apiRoutes, type Services } from "./routes";
import { webhookRoutes } from "./routes/webhook.routes";

export function createApp(services: Services, options: { diditWebhookSecret: string | undefined }): Express {
  const app = express();
  app.disable("x-powered-by");
  // Before express.json(): webhook signatures need the raw body.
  app.use("/api/webhooks", webhookRoutes(services.kyc, options.diditWebhookSecret));
  app.use(express.json({ limit: "100kb" }));

  app.use("/api", apiRoutes(services));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
