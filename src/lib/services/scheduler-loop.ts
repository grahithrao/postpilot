import { env } from "@/lib/env";

/**
 * The in-process scheduler.
 *
 * Production deployments should drive POST /api/cron/tick from a real cron
 * (Vercel Cron, a Kubernetes CronJob, systemd) and set
 * ENABLE_IN_PROCESS_SCHEDULER=false. This loop exists so that a local demo
 * publishes scheduled posts without a second terminal window.
 *
 * It is started from the authenticated app layout rather than
 * `instrumentation.ts`, because Next compiles instrumentation for the edge
 * runtime too and this module's dependency graph reaches Node-only crypto.
 * Server Components always run in the Node.js runtime, and the global guard
 * below makes the call idempotent across renders and hot reloads.
 */
const globalForScheduler = globalThis as unknown as { postpilotScheduler?: NodeJS.Timeout };

export function startInProcessScheduler() {
  if (globalForScheduler.postpilotScheduler) return;
  const config = env();
  if (!config.ENABLE_IN_PROCESS_SCHEDULER) return;

  const interval = Math.max(5_000, config.SCHEDULER_INTERVAL_MS);
  let running = false;

  const timer = setInterval(async () => {
    // Overlapping ticks would fight over the same jobs; the DB lease would win,
    // but skipping is cheaper.
    if (running) return;
    running = true;
    try {
      const { runSchedulerTick } = await import("./scheduling");
      const result = await runSchedulerTick({ limit: 5 });
      if (result.processed > 0 || result.automationsRun > 0) {
        console.log(
          `[scheduler] processed ${result.processed} job(s): ${result.published} published, ${result.failed} failed, ${result.blocked} blocked, ${result.skipped} skipped; ${result.automationsRun} automation(s) run.`,
        );
      }
    } catch (error) {
      console.error("[scheduler] tick failed:", error instanceof Error ? error.message : error);
    } finally {
      running = false;
    }
  }, interval);

  timer.unref?.();
  globalForScheduler.postpilotScheduler = timer;
  console.log(`[scheduler] in-process scheduler started (every ${interval / 1000}s)`);
}
