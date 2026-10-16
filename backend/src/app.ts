import express, { type Express } from "express";
import { errorHandler, notFound } from "./middleware/error-handler";
import { apiRoutes, type Services } from "./routes";

export function createApp(services: Services): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));

  app.use("/api", apiRoutes(services));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
