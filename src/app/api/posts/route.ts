import { PostStatus, RevisionSource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fail, ok, readJson, withUser } from "@/lib/api/handler";
import { contentQuerySchema, createPostSchema } from "@/lib/validation/schemas";
import { listPosts } from "@/lib/services/posts";
import { logActivity, ActivityType } from "@/lib/services/activity";
import { sanitizeHashtags, sanitizeKeywords, sanitizeSingleLine, sanitizeText } from "@/lib/security/sanitize";

export const GET = withUser(async (user, request) => {
  try {
    const url = new URL(request.url);
    const query = contentQuerySchema.parse(Object.fromEntries(url.searchParams));
    return ok(await listPosts(user.id, query));
  } catch (error) {
    return fail(error);
  }
});

/** Creates a post by hand, without the agent. Always starts as a draft. */
export const POST = withUser(async (user, request) => {
  try {
    const input = createPostSchema.parse(await readJson(request));

    const post = await prisma.post.create({
      data: {
        userId: user.id,
        topic: sanitizeSingleLine(input.topic, 300),
        product: input.product ? sanitizeSingleLine(input.product, 200) : null,
        audience: input.audience ? sanitizeSingleLine(input.audience, 200) : null,
        contentType: input.contentType,
        tone: input.tone,
        length: input.length,
        language: input.language,
        keywords: sanitizeKeywords(input.keywords),
        ctaRequest: input.ctaRequest ? sanitizeSingleLine(input.ctaRequest, 200) : null,
        notes: input.notes ? sanitizeText(input.notes, 1000) : null,
        platform: input.platform,
        socialAccountId: input.socialAccountId ?? null,
        headline: input.headline ? sanitizeSingleLine(input.headline, 300) : null,
        caption: sanitizeText(input.caption),
        hashtags: sanitizeHashtags(input.hashtags),
        cta: input.cta ? sanitizeSingleLine(input.cta, 300) : null,
        imagePrompt: input.imagePrompt ? sanitizeText(input.imagePrompt, 2000) : null,
        // A hand-written post is a draft until a human approves it, exactly like
        // a generated one.
        status: PostStatus.DRAFT,
        version: 1,
      },
    });

    await prisma.postRevision.create({
      data: {
        postId: post.id,
        version: 1,
        source: RevisionSource.HUMAN_EDIT,
        changeSummary: "Written by hand.",
        authorId: user.id,
        headline: post.headline,
        caption: post.caption,
        hashtags: post.hashtags,
        cta: post.cta,
        imagePrompt: post.imagePrompt,
      },
    });

    await logActivity({
      userId: user.id,
      postId: post.id,
      type: ActivityType.POST_CREATED,
      message: `Created "${post.topic}" by hand.`,
    });

    return ok(post, 201);
  } catch (error) {
    return fail(error);
  }
});
