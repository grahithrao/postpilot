import { AutomationFrequency } from "@prisma/client";

/**
 * Pure schedule maths for automations.
 *
 * Separated from `automation.ts` because the settings UI renders
 * `describeSchedule`, and `automation.ts` reaches the LangGraph agent — importing
 * it from a Client Component would pull the whole agent into the browser bundle.
 */
export interface AutomationCadence {
  frequency: AutomationFrequency;
  dayOfWeek: number;
  dayOfMonth: number;
  hour: number;
  minute: number;
}

/**
 * Computes the next firing time.
 *
 * Deliberately simple and dependency-free: the schedule shape the product
 * exposes (frequency + day + hour) does not need a full cron parser, and this
 * keeps the next-run calculation readable and testable.
 */
export function computeNextRun(automation: AutomationCadence, from: Date = new Date()): Date {
  const next = new Date(from);
  next.setSeconds(0, 0);

  switch (automation.frequency) {
    case AutomationFrequency.HOURLY: {
      next.setMinutes(automation.minute);
      if (next <= from) next.setHours(next.getHours() + 1);
      return next;
    }
    case AutomationFrequency.DAILY: {
      next.setHours(automation.hour, automation.minute, 0, 0);
      if (next <= from) next.setDate(next.getDate() + 1);
      return next;
    }
    case AutomationFrequency.WEEKLY:
    case AutomationFrequency.BIWEEKLY: {
      next.setHours(automation.hour, automation.minute, 0, 0);
      const delta = (automation.dayOfWeek - next.getDay() + 7) % 7;
      next.setDate(next.getDate() + delta);
      if (next <= from) {
        next.setDate(next.getDate() + (automation.frequency === AutomationFrequency.WEEKLY ? 7 : 14));
      }
      return next;
    }
    case AutomationFrequency.MONTHLY: {
      next.setDate(Math.min(automation.dayOfMonth, 28));
      next.setHours(automation.hour, automation.minute, 0, 0);
      if (next <= from) next.setMonth(next.getMonth() + 1);
      return next;
    }
    default:
      return new Date(from.getTime() + 24 * 3600_000);
  }
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Human-readable cadence, e.g. "Every Monday at 09:00". */
export function describeSchedule(automation: AutomationCadence): string {
  const time = `${String(automation.hour).padStart(2, "0")}:${String(automation.minute).padStart(2, "0")}`;
  switch (automation.frequency) {
    case AutomationFrequency.HOURLY:
      return `Every hour at :${String(automation.minute).padStart(2, "0")}`;
    case AutomationFrequency.DAILY:
      return `Every day at ${time}`;
    case AutomationFrequency.WEEKLY:
      return `Every ${DAYS[automation.dayOfWeek]} at ${time}`;
    case AutomationFrequency.BIWEEKLY:
      return `Every other ${DAYS[automation.dayOfWeek]} at ${time}`;
    case AutomationFrequency.MONTHLY:
      return `Day ${automation.dayOfMonth} of each month at ${time}`;
    default:
      return time;
  }
}
