import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env, corsOrigins } from "./config/env";
import { errorHandler, requireApiKey } from "./middleware/errorHandler";
import { kpisRouter } from "./routes/kpis";
import { pipelineRouter } from "./routes/pipeline";
import { conversationsRouter } from "./routes/conversations";
import { activityRouter } from "./routes/activity";
import { webhooksRouter } from "./routes/webhooks";
import { startScheduler } from "./cron/scheduler";

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
  })
);
app.use(express.json({ limit: "1mb" }));

// Basic abuse protection on top of the dashboard API key.
const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120 });
app.use("/api", apiLimiter);

app.get("/health", (_req, res) => {
  res.json({ ok: true, env: env.NODE_ENV });
});

// Public routes: inbound reply webhook (signature-verified) + unsubscribe link
// (must be reachable directly from an email client, so it stays outside the
// dashboard API key gate).
app.use("/api/webhooks", webhooksRouter);
app.use("/api", webhooksRouter); // exposes GET /api/unsubscribe/:token at the documented path

// Dashboard REST API — all protected by a shared API key.
app.use("/api/kpis", requireApiKey, kpisRouter);
app.use("/api/pipeline", requireApiKey, pipelineRouter);
app.use("/api/conversations", requireApiKey, conversationsRouter);
app.use("/api/activity", requireApiKey, activityRouter);

app.use(errorHandler);

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`LeadFinder AI backend listening on port ${env.PORT} (${env.NODE_ENV})`);
  startScheduler();
});
