/* eslint-disable no-console */
/**
 * Standalone scheduler worker.
 *
 * Run with `npm run worker` to process due schedules and automations outside
 * the Next.js process — the deployment shape you would use in production if you
 * are not driving /api/cron/tick from a platform cron.
 */
try {
  process.loadEnvFile?.(".env");
} catch {
  // .env is optional when the environment is already populated.
}

import { runSchedulerTick } from "../src/lib/services/scheduling";
import { prisma } from "../src/lib/db";

const INTERVAL_MS = Number(process.env.SCHEDULER_INTERVAL_MS ?? 15_000);
let stopping = false;

async function tick() {
  const started = Date.now();
  try {
    const result = await runSchedulerTick({ limit: 10 });
    if (result.processed > 0 || result.automationsRun > 0) {
      console.log(
        `[worker] ${new Date().toISOString()} processed=${result.processed} published=${result.published} failed=${result.failed} blocked=${result.blocked} skipped=${result.skipped} automations=${result.automationsRun} (${Date.now() - started}ms)`,
      );
      for (const outcome of result.outcomes) {
        console.log(`  - ${outcome.status.padEnd(9)} post=${outcome.postId} ${outcome.message}`);
      }
    }
  } catch (error) {
    console.error("[worker] tick failed:", error);
  }
}

async function main() {
  console.log(`[worker] started, polling every ${INTERVAL_MS / 1000}s. Ctrl-C to stop.`);
  while (!stopping) {
    await tick();
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
  await prisma.$disconnect();
  console.log("[worker] stopped.");
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`\n[worker] ${signal} received, finishing the current tick...`);
    stopping = true;
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
