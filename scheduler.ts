import cron from "node-cron";
import { runDiscoverLeadsJob } from "../jobs/discoverLeads";
import { runSendOutreachJob } from "../jobs/sendOutreach";

/**
 * Registers the two scheduled jobs. Times are UTC by default in node-cron;
 * adjust the cron expressions or pass a `timezone` option if you want these
 * pinned to a specific local time zone (e.g. business hours only).
 */
export function startScheduler(): void {
  // Daily lead discovery — once a day at 06:00 UTC.
  cron.schedule("0 6 * * *", async () => {
    // eslint-disable-next-line no-console
    console.log("[cron] starting lead discovery job...");
    try {
      const result = await runDiscoverLeadsJob();
      // eslint-disable-next-line no-console
      console.log(`[cron] lead discovery done: scanned=${result.scanned} inserted=${result.inserted}`);
    } catch (err) {
      console.error("[cron] lead discovery job failed:", err);
    }
  });

  // Hourly outreach sending, at minute 15 of every hour (avoids clashing with
  // the top-of-hour discovery run and other scheduled jobs on shared infra).
  cron.schedule("15 * * * *", async () => {
    // eslint-disable-next-line no-console
    console.log("[cron] starting send outreach job...");
    try {
      const result = await runSendOutreachJob();
      // eslint-disable-next-line no-console
      console.log(`[cron] send outreach done: sent=${result.sent} skipped=${result.skipped}`);
    } catch (err) {
      console.error("[cron] send outreach job failed:", err);
    }
  });

  // eslint-disable-next-line no-console
  console.log("[cron] scheduler started (discovery: daily 06:00 UTC, outreach: hourly at :15)");
}
