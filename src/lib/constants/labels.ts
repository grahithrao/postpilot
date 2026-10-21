import type {
  ActivityType,
  ApprovalDecision,
  AutomationFrequency,
  ContentLength,
  ContentType,
  PostStatus,
  PublishLogStatus,
  RevisionSource,
  ScheduleStatus,
  SocialAccountStatus,
  Tone,
} from "@prisma/client";

export const POST_STATUS_LABEL: Record<PostStatus, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  SCHEDULED: "Scheduled",
  PUBLISHING: "Publishing",
  PUBLISHED: "Published",
  FAILED: "Failed",
  ARCHIVED: "Archived",
};

/** Badge styling per status. Kept in one place so every surface agrees. */
export const POST_STATUS_STYLE: Record<PostStatus, string> = {
  DRAFT: "bg-muted text-muted-foreground border-border",
  PENDING_APPROVAL: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
  APPROVED: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  REJECTED: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30",
  SCHEDULED: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30",
  PUBLISHING: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30",
  PUBLISHED: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/30",
  FAILED: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30",
  ARCHIVED: "bg-muted text-muted-foreground border-border",
};

export const CONTENT_TYPE_LABEL: Record<ContentType, string> = {
  SOCIAL_POST: "Social post",
  PROMOTIONAL: "Promotional post",
  EDUCATIONAL: "Educational post",
  ANNOUNCEMENT: "Announcement",
  PRODUCT_LAUNCH: "Product launch",
  EVENT_PROMOTION: "Event promotion",
  ENGAGEMENT: "Engagement post",
};

export const CONTENT_TYPE_HINT: Record<ContentType, string> = {
  SOCIAL_POST: "A general update in your brand voice.",
  PROMOTIONAL: "Drives a specific offer, trial or conversion.",
  EDUCATIONAL: "Teaches something concrete and useful.",
  ANNOUNCEMENT: "Shares company or product news.",
  PRODUCT_LAUNCH: "Introduces a new product with benefits and a CTA.",
  EVENT_PROMOTION: "Promotes a webinar, conference or meetup.",
  ENGAGEMENT: "Asks a question to start a conversation.",
};

export const TONE_LABEL: Record<Tone, string> = {
  PROFESSIONAL: "Professional",
  CASUAL: "Casual",
  FRIENDLY: "Friendly",
  WITTY: "Witty",
  INSPIRATIONAL: "Inspirational",
  AUTHORITATIVE: "Authoritative",
  EMPATHETIC: "Empathetic",
  BOLD: "Bold",
};

export const LENGTH_LABEL: Record<ContentLength, string> = {
  SHORT: "Short",
  MEDIUM: "Medium",
  LONG: "Long",
};

export const APPROVAL_DECISION_LABEL: Record<ApprovalDecision, string> = {
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CHANGES_REQUESTED: "Changes requested",
  REGENERATION_REQUESTED: "Regeneration requested",
};

export const REVISION_SOURCE_LABEL: Record<RevisionSource, string> = {
  AI_GENERATED: "AI generated",
  AI_IMPROVED: "AI improved",
  AI_SHORTENED: "AI shortened",
  AI_EXPANDED: "AI expanded",
  AI_TONE_SHIFT: "AI tone change",
  AI_REWRITE: "AI rewrite",
  AI_REGENERATED: "AI regenerated",
  HUMAN_EDIT: "Human edit",
  AUTOMATION: "Automation",
};

export const SCHEDULE_STATUS_LABEL: Record<ScheduleStatus, string> = {
  PENDING: "Pending",
  QUEUED: "Queued",
  PUBLISHING: "Publishing",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

export const PUBLISH_LOG_LABEL: Record<PublishLogStatus, string> = {
  ATTEMPT: "Attempt",
  SUCCESS: "Success",
  FAILURE: "Failure",
  RETRY_SCHEDULED: "Retry scheduled",
  BLOCKED: "Blocked",
  SKIPPED_DUPLICATE: "Skipped (duplicate)",
};

export const ACCOUNT_STATUS_LABEL: Record<SocialAccountStatus, string> = {
  CONNECTED: "Connected",
  DISCONNECTED: "Disconnected",
  TOKEN_EXPIRED: "Token expired",
  ERROR: "Error",
};

export const FREQUENCY_LABEL: Record<AutomationFrequency, string> = {
  HOURLY: "Hourly",
  DAILY: "Daily",
  WEEKLY: "Weekly",
  BIWEEKLY: "Every 2 weeks",
  MONTHLY: "Monthly",
};

export const ACTIVITY_LABEL: Record<ActivityType, string> = {
  POST_CREATED: "Post created",
  POST_GENERATED: "Content generated",
  POST_EDITED: "Post edited",
  POST_SUBMITTED: "Sent for approval",
  POST_APPROVED: "Post approved",
  POST_REJECTED: "Post rejected",
  POST_CHANGES_REQUESTED: "Changes requested",
  POST_REGENERATED: "Content regenerated",
  POST_SCHEDULED: "Post scheduled",
  POST_RESCHEDULED: "Post rescheduled",
  POST_SCHEDULE_CANCELLED: "Schedule cancelled",
  POST_PUBLISHING: "Publishing started",
  POST_PUBLISHED: "Post published",
  POST_FAILED: "Publishing failed",
  POST_DELETED: "Post deleted",
  POST_DUPLICATED: "Post duplicated",
  PUBLISH_BLOCKED: "Publishing blocked",
  ACCOUNT_CONNECTED: "Account connected",
  ACCOUNT_DISCONNECTED: "Account disconnected",
  ACCOUNT_SYNCED: "Account synced",
  AUTOMATION_CREATED: "Automation created",
  AUTOMATION_UPDATED: "Automation updated",
  AUTOMATION_RUN: "Automation ran",
  AUTOMATION_DELETED: "Automation deleted",
  USER_LOGIN: "Signed in",
};

export const DAYS_OF_WEEK = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const LANGUAGES = [
  "English",
  "Spanish",
  "French",
  "German",
  "Portuguese",
  "Italian",
  "Dutch",
  "Hindi",
  "Japanese",
] as const;
