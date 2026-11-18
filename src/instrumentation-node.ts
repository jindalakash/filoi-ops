import cron from "node-cron";

const g = globalThis as unknown as { __filoiCron?: boolean };

if (!g.__filoiCron && process.env.DISABLE_CRON !== "1") {
  g.__filoiCron = true;
  // Checks every hour; the reminder job itself only fires at the configured hour.
  cron.schedule("0 * * * *", async () => {
    try {
      const { getSetting } = await import("./lib/settings");
      const cfg = await getSetting("reminders");
      if (new Date().getHours() !== Number(cfg.hour ?? 8)) return;
      const { runReminders } = await import("./lib/reminders");
      await runReminders();
    } catch (e) {
      console.error("[reminders] failed", e);
    }
  });
  console.log("[filoi] reminder scheduler started");
}
