import { Router, type RequestHandler } from "express";

export interface HealthDto {
  status: "ok";
}

const getHealth: RequestHandler = (_req, res) => {
  const body: HealthDto = { status: "ok" };
  res.json(body);
};

export function healthRoutes(): Router {
  return Router().get("/", getHealth);
}
