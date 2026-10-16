import { Router } from "express";
import { getHealth } from "../controllers/health.controller";

export function healthRoutes(): Router {
  return Router().get("/", getHealth);
}
