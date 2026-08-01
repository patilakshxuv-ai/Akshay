import { Router } from "express";
import { getRecentEvents } from "../services/eventsService";
import { asyncHandler } from "../middleware/errorHandler";

export const activityRouter = Router();

/**
 * GET /api/activity?limit=50
 * Powers the live activity feed on the dashboard.
 */
activityRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const events = await getRecentEvents(limit);
    res.json({ events });
  })
);
