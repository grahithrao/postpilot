import type { Prisma } from "@prisma/client";
import { ActivityType, NotificationType } from "@prisma/client";
import { prisma } from "@/lib/db";

type Client = Prisma.TransactionClient | typeof prisma;

export async function logActivity(
  input: {
    userId: string;
    postId?: string | null;
    type: ActivityType;
    message: string;
    metadata?: Prisma.InputJsonValue;
  },
  client: Client = prisma,
) {
  return client.activityLog.create({
    data: {
      userId: input.userId,
      postId: input.postId ?? null,
      type: input.type,
      message: input.message,
      metadata: input.metadata,
    },
  });
}

export async function notify(
  input: {
    userId: string;
    type: NotificationType;
    title: string;
    body?: string;
    link?: string;
  },
  client: Client = prisma,
) {
  return client.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link,
    },
  });
}

export { ActivityType, NotificationType };
