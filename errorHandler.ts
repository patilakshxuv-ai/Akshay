import { NextFunction, Request, Response } from "express";
import { env } from "../config/env";

/** Simple shared-secret auth for the dashboard REST API (not the public webhook route). */
export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const key = req.header("x-api-key");
  if (key !== env.DASHBOARD_API_KEY) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

/** Wraps an async route handler so thrown errors reach Express's error middleware. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  // eslint-disable-next-line no-console
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
}
