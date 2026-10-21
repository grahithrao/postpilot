/* eslint-disable no-console */
import {
  ActivityType,
  ApprovalDecision,
  AutomationFrequency,
  NotificationType,
  PostStatus,
  PrismaClient,
  PublishLogStatus,
  RevisionSource,
  ScheduleStatus,
  SocialAccountStatus,
  type ContentLength,
  type Platform,
  type Prisma,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { composeContent } from "../src/lib/ai/mock/copy-engine";
import { validateContent } from "../src/lib/ai/validators";
import { generateDemoMetrics } from "../src/lib/analytics/demo-metrics";
import { computeNextRun } from "../src/lib/services/automation";
import { PLATFORMS } from "../src/lib/constants/platforms";
import { REJECTION_FEEDBACK, REVIEWER_FEEDBACK, SEED_BRIEFS } from "./seed-data";
import type { ContentBrief } from "../src/lib/ai/types";

const prisma = new PrismaClient();

const DEMO_EMAIL = "demo@postpilot.app";
const DEMO_PASSWORD = "demo1234";

const DAY = 86_400_000;
const HOUR = 3_600_000;

/** Deterministic pseudo-random so re-seeding produces the same demo workspace. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = rng(20260213);
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(random() * xs.length)]!;

/**
 * The lifecycle each seeded post is walked through. The mix is chosen so every
 * screen in the product has something meaningful on it the first time it loads.
 */
type Lane =
  | "PUBLISHED"
  | "PUBLISHED_RECENT"
  | "SCHEDULED"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "DRAFT"
  | "REJECTED"
  | "FAILED";

const LANES: Lane[] = [
  "PUBLISHED", "PUBLISHED", "PUBLISHED", "PUBLISHED", "PUBLISHED", "PUBLISHED",
  "PUBLISHED_RECENT", "PUBLISHED_RECENT", "PUBLISHED_RECENT", "PUBLISHED_RECENT",
  "SCHEDULED", "SCHEDULED", "SCHEDULED", "SCHEDULED", "SCHEDULED",
  "PENDING_APPROVAL", "PENDING_APPROVAL", "PENDING_APPROVAL", "PENDING_APPROVAL",
  "APPROVED", "APPROVED",
  "DRAFT", "DRAFT", "DRAFT",
  "REJECTED", "REJECTED",
  "FAILED",
  "PUBLISHED",
];

async function reset() {
  console.log("  clearing existing demo data...");
  // Order matters where onDelete is not CASCADE.
  await prisma.agentCheckpointWrite.deleteMany();
  await prisma.agentCheckpoint.deleteMany();
  await prisma.agentRun.deleteMany();
  await prisma.analyticsSnapshot.deleteMany();
  await prisma.publishingLog.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.approval.deleteMany();
  await prisma.postRevision.deleteMany();
  await prisma.automationRun.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.activityLog.deleteMany();
  await prisma.post.deleteMany();
  await prisma.automation.deleteMany();
  await prisma.socialAccount.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();
}

async function main() {
  console.log("Seeding PostPilot demo workspace...");
  await reset();

  // --- user ---------------------------------------------------------------
  const user = await prisma.user.create({
    data: {
      email: DEMO_EMAIL,
      name: "Alex Rivera",
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12),
      role: "ADMIN",
      timezone: "Europe/London",
    },
  });
  console.log(`  user: ${user.email} / ${DEMO_PASSWORD}`);

  // --- social accounts ----------------------------------------------------
  const accountSeeds: Array<{
    platform: Platform;
    handle: string;
    displayName: string;
    followerCount: number;
    status: SocialAccountStatus;
  }> = [
    { platform: "LINKEDIN", handle: "northwind-labs", displayName: "Northwind Labs", followerCount: 18420, status: SocialAccountStatus.CONNECTED },
    { platform: "X", handle: "northwindlabs", displayName: "Northwind Labs", followerCount: 9260, status: SocialAccountStatus.CONNECTED },
    { platform: "INSTAGRAM", handle: "northwind.labs", displayName: "Northwind Studio", followerCount: 6180, status: SocialAccountStatus.CONNECTED },
    { platform: "FACEBOOK", handle: "NorthwindLabs", displayName: "Northwind Labs", followerCount: 4310, status: SocialAccountStatus.CONNECTED },
  ];

  const accounts = new Map<Platform, { id: string; followerCount: number; handle: string }>();
  for (const seed of accountSeeds) {
    const account = await prisma.socialAccount.create({
      data: {
        userId: user.id,
        platform: seed.platform,
        platformAccountId: `demo_${seed.platform.toLowerCase()}_${100000 + Math.floor(random() * 899999)}`,
        handle: seed.handle,
        displayName: seed.displayName,
        followerCount: seed.followerCount,
        status: seed.status,
        isDemo: true,
        scopes: [],
        lastSyncedAt: new Date(Date.now() - random() * 6 * HOUR),
      },
    });
    accounts.set(seed.platform, { id: account.id, followerCount: account.followerCount, handle: account.handle });
  }
  console.log(`  connected ${accounts.size} demo social accounts`);

  // --- posts --------------------------------------------------------------
  let published = 0;
  let scheduled = 0;
  let pending = 0;

  for (let i = 0; i < SEED_BRIEFS.length; i++) {
    const seedBrief = SEED_BRIEFS[i]!;
    const lane = LANES[i % LANES.length]!;
    const account = accounts.get(seedBrief.platform)!;
    const spec = PLATFORMS[seedBrief.platform];

    const brief: ContentBrief = {
      topic: seedBrief.topic,
      product: seedBrief.product ?? null,
      audience: seedBrief.audience ?? null,
      platform: seedBrief.platform,
      contentType: seedBrief.contentType,
      tone: seedBrief.tone,
      length: seedBrief.length as ContentLength,
      language: "English",
      ctaRequest: seedBrief.ctaRequest ?? null,
      keywords: seedBrief.keywords,
      hashtags: [],
      notes: null,
    };

    const content = composeContent(brief, { variant: i });
    const validation = validateContent(brief, content);
    const subjective = 68 + random() * 26;
    const score = Math.round(
      Math.min(
        99,
        validation.hardViolations.length
          ? Math.min(58, validation.structuralScore * 0.6 + subjective * 0.4)
          : validation.structuralScore * 0.55 + subjective * 0.45,
      ),
    );

    const qualityReport = {
      score,
      verdict: validation.hardViolations.length ? "fail" : score >= 60 ? "pass" : "revise",
      checks: validation.checks,
      strengths: [
        "Opening line survives the feed truncation.",
        `Hashtag count is on target for ${spec.name}.`,
      ],
      risks: validation.checks.filter((c) => c.status !== "pass").map((c) => c.detail).slice(0, 2),
      suggestions: ["Consider testing a second hook variant against this one."],
      hardViolations: validation.hardViolations,
      scoredBy: "mock:postpilot-mock-1",
    };

    // Timeline: published in the past, scheduled in the future.
    const createdAt =
      lane === "PUBLISHED"
        ? new Date(Date.now() - (14 + random() * 30) * DAY)
        : lane === "PUBLISHED_RECENT"
          ? new Date(Date.now() - (2 + random() * 11) * DAY)
          : lane === "SCHEDULED"
            ? new Date(Date.now() - (1 + random() * 3) * DAY)
            : new Date(Date.now() - random() * 6 * DAY);

    const status: PostStatus =
      lane === "PUBLISHED" || lane === "PUBLISHED_RECENT"
        ? PostStatus.PUBLISHED
        : lane === "SCHEDULED"
          ? PostStatus.SCHEDULED
          : lane === "PENDING_APPROVAL"
            ? PostStatus.PENDING_APPROVAL
            : lane === "APPROVED"
              ? PostStatus.APPROVED
              : lane === "REJECTED"
                ? PostStatus.REJECTED
                : lane === "FAILED"
                  ? PostStatus.FAILED
                  : PostStatus.DRAFT;

    const publishedAt =
      status === PostStatus.PUBLISHED ? new Date(createdAt.getTime() + (4 + random() * 20) * HOUR) : null;

    const externalId = publishedAt ? `${seedBrief.platform.toLowerCase()}_${Math.random().toString(16).slice(2, 20)}` : null;

    const post = await prisma.post.create({
      data: {
        userId: user.id,
        topic: brief.topic,
        product: brief.product,
        audience: brief.audience,
        contentType: brief.contentType,
        tone: brief.tone,
        length: brief.length,
        language: brief.language,
        keywords: brief.keywords,
        ctaRequest: brief.ctaRequest,
        platform: brief.platform,
        socialAccountId: account.id,
        headline: content.headline,
        caption: content.caption,
        hashtags: content.hashtags,
        cta: content.cta,
        imagePrompt: content.imagePrompt,
        suggestedTime: new Date(createdAt.getTime() + 2 * DAY),
        status,
        version: 1,
        qualityScore: score,
        qualityReport: qualityReport as unknown as Prisma.InputJsonValue,
        aiProvider: "mock",
        aiModel: "postpilot-mock-1",
        generatedMs: Math.round(420 + random() * 900),
        publishedAt,
        publishedUrl: externalId ? `https://${spec.name.toLowerCase()}.example/${account.handle}/${externalId}` : null,
        externalId,
        publishAttempts: publishedAt ? 1 : 0,
        failureReason:
          lane === "FAILED"
            ? "LinkedIn API returned 503 Service Unavailable (simulated). All 3 attempts failed."
            : null,
        createdAt,
        updatedAt: publishedAt ?? createdAt,
      },
    });

    await prisma.postRevision.create({
      data: {
        postId: post.id,
        version: 1,
        source: RevisionSource.AI_GENERATED,
        changeSummary: "Initial draft from the content brief.",
        headline: content.headline,
        caption: content.caption,
        hashtags: content.hashtags,
        cta: content.cta,
        imagePrompt: content.imagePrompt,
        qualityScore: score,
        createdAt,
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: user.id,
        postId: post.id,
        type: ActivityType.POST_GENERATED,
        message: `Demo model generated v1 in ${post.generatedMs}ms.`,
        createdAt,
      },
    });

    // --- approvals --------------------------------------------------------
    const approvedLanes: Lane[] = ["PUBLISHED", "PUBLISHED_RECENT", "SCHEDULED", "APPROVED", "FAILED"];
    if (approvedLanes.includes(lane)) {
      const decidedAt = new Date(createdAt.getTime() + (1 + random() * 6) * HOUR);
      await prisma.approval.create({
        data: {
          postId: post.id,
          reviewerId: user.id,
          decision: ApprovalDecision.APPROVED,
          feedback: pick(REVIEWER_FEEDBACK),
          qualityScoreAtDecision: score,
          postVersion: 1,
          createdAt: decidedAt,
        },
      });
      await prisma.activityLog.create({
        data: {
          userId: user.id,
          postId: post.id,
          type: ActivityType.POST_APPROVED,
          message: "Post approved.",
          createdAt: decidedAt,
        },
      });
    } else if (lane === "REJECTED") {
      const decidedAt = new Date(createdAt.getTime() + 2 * HOUR);
      await prisma.approval.create({
        data: {
          postId: post.id,
          reviewerId: user.id,
          decision: ApprovalDecision.REJECTED,
          feedback: pick(REJECTION_FEEDBACK),
          qualityScoreAtDecision: score,
          postVersion: 1,
          createdAt: decidedAt,
        },
      });
      await prisma.activityLog.create({
        data: {
          userId: user.id,
          postId: post.id,
          type: ActivityType.POST_REJECTED,
          message: "Post rejected by reviewer.",
          createdAt: decidedAt,
        },
      });
    } else if (lane === "PENDING_APPROVAL") {
      pending++;
      await prisma.activityLog.create({
        data: {
          userId: user.id,
          postId: post.id,
          type: ActivityType.POST_SUBMITTED,
          message: "Sent to the approval queue at v1.",
          createdAt: new Date(createdAt.getTime() + 20 * 60_000),
        },
      });
      await prisma.notification.create({
        data: {
          userId: user.id,
          type: NotificationType.APPROVAL_REQUESTED,
          title: "A post is waiting for your approval",
          body: post.headline ?? post.caption.slice(0, 120),
          link: "/approvals",
          read: random() > 0.6,
          createdAt: new Date(createdAt.getTime() + 20 * 60_000),
        },
      });
    }

    // --- schedules & publishing ------------------------------------------
    if (status === PostStatus.PUBLISHED && publishedAt) {
      published++;
      const schedule = await prisma.schedule.create({
        data: {
          postId: post.id,
          userId: user.id,
          socialAccountId: account.id,
          scheduledFor: publishedAt,
          timezone: "Europe/London",
          status: ScheduleStatus.COMPLETED,
          attempts: 1,
          lastAttemptAt: publishedAt,
          completedAt: publishedAt,
          idempotencyKey: `post:${post.id}:v1`,
          createdAt: new Date(publishedAt.getTime() - 6 * HOUR),
        },
      });
      await prisma.publishingLog.createMany({
        data: [
          {
            postId: post.id,
            scheduleId: schedule.id,
            platform: post.platform,
            status: PublishLogStatus.ATTEMPT,
            attempt: 1,
            message: `Dispatching to the ${spec.name} adapter.`,
            createdAt: publishedAt,
          },
          {
            postId: post.id,
            scheduleId: schedule.id,
            platform: post.platform,
            status: PublishLogStatus.SUCCESS,
            attempt: 1,
            message: `Published to ${spec.name} and verified live.`,
            externalId: externalId!,
            externalUrl: post.publishedUrl,
            latencyMs: Math.round(280 + random() * 700),
            createdAt: new Date(publishedAt.getTime() + 900),
          },
        ],
      });
      await prisma.activityLog.create({
        data: {
          userId: user.id,
          postId: post.id,
          type: ActivityType.POST_PUBLISHED,
          message: `Published to ${spec.name} as ${spec.handlePrefix}${account.handle}.`,
          createdAt: publishedAt,
        },
      });

      await prisma.analyticsSnapshot.create({
        data: {
          postId: post.id,
          platform: post.platform,
          capturedAt: new Date(Math.min(Date.now(), publishedAt.getTime() + 3 * DAY)),
          ...generateDemoMetrics({
            postId: post.id,
            platform: post.platform,
            followerCount: account.followerCount,
            qualityScore: score,
            publishedAt,
            hashtagCount: content.hashtags.length,
            hasMedia: true,
          }),
        },
      });
    }

    if (status === PostStatus.SCHEDULED) {
      scheduled++;
      // Spread upcoming posts across the next two weeks at good hours.
      const daysAhead = 1 + Math.floor(random() * 13);
      const slot = new Date();
      slot.setDate(slot.getDate() + daysAhead);
      slot.setHours(spec.bestHours[Math.floor(random() * spec.bestHours.length)]!, 0, 0, 0);

      await prisma.schedule.create({
        data: {
          postId: post.id,
          userId: user.id,
          socialAccountId: account.id,
          scheduledFor: slot,
          timezone: "Europe/London",
          status: ScheduleStatus.PENDING,
          idempotencyKey: `post:${post.id}:v1`,
        },
      });
      await prisma.activityLog.create({
        data: {
          userId: user.id,
          postId: post.id,
          type: ActivityType.POST_SCHEDULED,
          message: `Scheduled for ${slot.toISOString()} on ${spec.name}.`,
          createdAt: new Date(createdAt.getTime() + 3 * HOUR),
        },
      });
    }

    if (lane === "FAILED") {
      const failedAt = new Date(Date.now() - 2 * HOUR);
      const schedule = await prisma.schedule.create({
        data: {
          postId: post.id,
          userId: user.id,
          socialAccountId: account.id,
          scheduledFor: failedAt,
          timezone: "Europe/London",
          status: ScheduleStatus.FAILED,
          attempts: 3,
          maxAttempts: 3,
          lastAttemptAt: failedAt,
          lastError: "LinkedIn API returned 503 Service Unavailable (simulated).",
          idempotencyKey: `post:${post.id}:v1`,
        },
      });
      for (let attempt = 1; attempt <= 3; attempt++) {
        await prisma.publishingLog.create({
          data: {
            postId: post.id,
            scheduleId: schedule.id,
            platform: post.platform,
            status: attempt < 3 ? PublishLogStatus.RETRY_SCHEDULED : PublishLogStatus.FAILURE,
            attempt,
            message:
              attempt < 3
                ? `${spec.name} API returned 503 Service Unavailable (simulated). Retrying (attempt ${attempt + 1} of 3).`
                : `${spec.name} API returned 503 Service Unavailable (simulated).`,
            errorCode: "UPSTREAM_UNAVAILABLE",
            latencyMs: Math.round(1200 + random() * 900),
            createdAt: new Date(failedAt.getTime() + attempt * 10 * 60_000),
          },
        });
      }
      await prisma.notification.create({
        data: {
          userId: user.id,
          type: NotificationType.POST_FAILED,
          title: `Publishing to ${spec.name} failed`,
          body: "All 3 attempts returned 503. The post is ready to retry.",
          link: `/content/${post.id}`,
          createdAt: failedAt,
        },
      });
    }
  }

  console.log(`  posts: ${SEED_BRIEFS.length} (${published} published, ${scheduled} scheduled, ${pending} awaiting approval)`);

  // --- automations --------------------------------------------------------
  const automationSeeds = [
    {
      name: "Monday thought leadership",
      description: "Generates a LinkedIn insight post every Monday morning and sends it straight to the approval queue.",
      frequency: AutomationFrequency.WEEKLY,
      dayOfWeek: 1,
      hour: 9,
      platform: "LINKEDIN" as Platform,
      topic: "an operational insight our team learned this week",
      audience: "operations leaders",
      tone: "PROFESSIONAL" as const,
      contentType: "EDUCATIONAL" as const,
      keywords: ["operations", "leadership"],
      enabled: true,
    },
    {
      name: "Midweek product highlight",
      description: "Highlights one Northwind Pulse feature every Wednesday.",
      frequency: AutomationFrequency.WEEKLY,
      dayOfWeek: 3,
      hour: 12,
      platform: "X" as Platform,
      topic: "a small Northwind Pulse feature worth knowing about",
      audience: "data teams",
      tone: "CASUAL" as const,
      contentType: "PROMOTIONAL" as const,
      keywords: ["product"],
      enabled: true,
    },
    {
      name: "Monthly community recap",
      description: "A monthly Instagram recap of what the team shipped and learned.",
      frequency: AutomationFrequency.MONTHLY,
      dayOfMonth: 1,
      hour: 11,
      platform: "INSTAGRAM" as Platform,
      topic: "what the Northwind team shipped and learned this month",
      audience: "the Northwind community",
      tone: "FRIENDLY" as const,
      contentType: "SOCIAL_POST" as const,
      keywords: ["community", "recap"],
      enabled: false,
    },
  ];

  for (const seed of automationSeeds) {
    const automation = await prisma.automation.create({
      data: {
        userId: user.id,
        name: seed.name,
        description: seed.description,
        frequency: seed.frequency,
        dayOfWeek: seed.dayOfWeek ?? 1,
        dayOfMonth: seed.dayOfMonth ?? 1,
        hour: seed.hour,
        minute: 0,
        timezone: "Europe/London",
        platform: seed.platform,
        socialAccountId: accounts.get(seed.platform)!.id,
        topic: seed.topic,
        audience: seed.audience,
        tone: seed.tone,
        contentType: seed.contentType,
        keywords: seed.keywords,
        requiresApproval: true,
        enabled: seed.enabled,
        runCount: seed.enabled ? 3 + Math.floor(random() * 6) : 0,
        lastRunAt: seed.enabled ? new Date(Date.now() - (2 + random() * 5) * DAY) : null,
        nextRunAt: seed.enabled
          ? computeNextRun({
              frequency: seed.frequency,
              dayOfWeek: seed.dayOfWeek ?? 1,
              dayOfMonth: seed.dayOfMonth ?? 1,
              hour: seed.hour,
              minute: 0,
            })
          : null,
      },
    });

    if (seed.enabled) {
      await prisma.automationRun.create({
        data: {
          automationId: automation.id,
          status: "SUCCEEDED",
          message: "Generated a draft and sent it to the approval queue.",
          startedAt: new Date(Date.now() - 3 * DAY),
          finishedAt: new Date(Date.now() - 3 * DAY + 4200),
        },
      });
    }
  }
  console.log(`  automations: ${automationSeeds.length}`);

  // --- workspace-level activity ------------------------------------------
  await prisma.activityLog.createMany({
    data: [
      {
        userId: user.id,
        type: ActivityType.ACCOUNT_CONNECTED,
        message: "Connected LinkedIn as in/northwind-labs (demo).",
        createdAt: new Date(Date.now() - 46 * DAY),
      },
      {
        userId: user.id,
        type: ActivityType.ACCOUNT_CONNECTED,
        message: "Connected X as @northwindlabs (demo).",
        createdAt: new Date(Date.now() - 46 * DAY),
      },
      {
        userId: user.id,
        type: ActivityType.AUTOMATION_CREATED,
        message: 'Created the "Monday thought leadership" automation.',
        createdAt: new Date(Date.now() - 40 * DAY),
      },
      {
        userId: user.id,
        type: ActivityType.USER_LOGIN,
        message: "Signed in.",
        createdAt: new Date(Date.now() - 2 * HOUR),
      },
    ],
  });

  await prisma.notification.createMany({
    data: [
      {
        userId: user.id,
        type: NotificationType.SYSTEM,
        title: "Welcome to PostPilot",
        body: "Demo Mode is on: AI generation and publishing are simulated, so the whole workflow works with no API keys.",
        link: "/settings",
        createdAt: new Date(Date.now() - 3 * HOUR),
      },
    ],
  });

  const counts = {
    posts: await prisma.post.count(),
    revisions: await prisma.postRevision.count(),
    approvals: await prisma.approval.count(),
    schedules: await prisma.schedule.count(),
    logs: await prisma.publishingLog.count(),
    analytics: await prisma.analyticsSnapshot.count(),
    activity: await prisma.activityLog.count(),
  };
  console.log("Seed complete:", counts);
  console.log(`\nSign in with ${DEMO_EMAIL} / ${DEMO_PASSWORD}\n`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
