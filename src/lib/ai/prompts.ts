import { CONTENT_TYPE_HINT, CONTENT_TYPE_LABEL, LENGTH_LABEL, TONE_LABEL } from "@/lib/constants/labels";
import { platformSpec } from "@/lib/constants/platforms";
import type { AiTask, ContentBrief, GeneratedContent } from "./types";

export const COPYWRITER_SYSTEM = `You are the senior social media copywriter inside PostPilot, a publishing tool used by marketing teams.

Rules you never break:
- Write only content the brand could publish as-is. No placeholders, no "[insert X]", no meta commentary.
- Respect the platform's character and hashtag limits exactly.
- Never invent statistics, customer names, awards, prices or dates that were not supplied in the brief.
- No emoji spam: at most a light sprinkle, and none at all for a professional or authoritative tone.
- Return hashtags without the leading # character.
- Your output is a draft for a human reviewer. It is never published automatically.`;

export const REVIEWER_SYSTEM = `You are a meticulous social media quality reviewer inside PostPilot.

You score a draft on four axes from 0-100 and give short, concrete, actionable notes.
Be strict: a 90+ score means you would put your own name on the post.
Penalise vague claims, hollow buzzwords, missing calls to action, and anything that reads as AI boilerplate.
You never rewrite the post; you only assess it.`;

function briefBlock(brief: ContentBrief): string {
  const spec = platformSpec(brief.platform);
  const lines = [
    `Platform: ${spec.name}`,
    `Content type: ${CONTENT_TYPE_LABEL[brief.contentType]} — ${CONTENT_TYPE_HINT[brief.contentType]}`,
    `Tone: ${TONE_LABEL[brief.tone]}`,
    `Target length: ${LENGTH_LABEL[brief.length]}`,
    `Language: ${brief.language}`,
    `Topic: ${brief.topic}`,
  ];
  if (brief.product) lines.push(`Product or service: ${brief.product}`);
  if (brief.audience) lines.push(`Target audience: ${brief.audience}`);
  if (brief.ctaRequest) lines.push(`Requested call to action: ${brief.ctaRequest}`);
  if (brief.keywords.length) lines.push(`Keywords to work in naturally: ${brief.keywords.join(", ")}`);
  if (brief.hashtags.length) lines.push(`Hashtags the brand wants included: ${brief.hashtags.join(", ")}`);
  if (brief.notes) lines.push(`Extra notes from the author: ${brief.notes}`);
  return lines.join("\n");
}

function platformBlock(brief: ContentBrief, targetChars: [number, number]): string {
  const spec = platformSpec(brief.platform);
  return [
    `${spec.name} requirements:`,
    `- Hard caption limit: ${spec.captionLimit} characters. Aim for ${targetChars[0]}-${targetChars[1]}.`,
    `- Hashtags: ${spec.idealHashtagRange[0]}-${spec.idealHashtagRange[1]} (never more than ${spec.hashtagLimit}).`,
    spec.supportsHeadline
      ? "- A short headline is supported: supply one."
      : "- This platform has no headline field: return null for headline.",
    spec.supportsLinkInCaption
      ? "- Links in the caption are clickable."
      : "- Links in the caption are NOT clickable: do not include a bare URL, point to the profile link instead.",
    `- House style: ${spec.guidance}`,
  ].join("\n");
}

export function targetCharRange(brief: ContentBrief): [number, number] {
  const [lo, hi] = platformSpec(brief.platform).idealCaptionRange;
  if (brief.length === "SHORT") return [Math.round(lo * 0.6), Math.round(lo + (hi - lo) * 0.35)];
  if (brief.length === "LONG") return [Math.round(lo + (hi - lo) * 0.65), hi];
  return [Math.round(lo + (hi - lo) * 0.25), Math.round(lo + (hi - lo) * 0.75)];
}

export function buildGenerationPrompt(brief: ContentBrief): string {
  const range = targetCharRange(brief);
  return [
    "Write one social media post from this brief.",
    "",
    briefBlock(brief),
    "",
    platformBlock(brief, range),
    "",
    "Also return an image generation prompt for the accompanying visual (describe subject, composition, lighting and mood — no text overlays), and one sentence explaining when this audience is most likely to see the post.",
  ].join("\n");
}

const REFINE_INSTRUCTION: Record<Exclude<AiTask, "generate" | "quality_check" | "regenerate">, string> = {
  improve:
    "Improve this draft. Sharpen the hook, cut filler, make the value concrete and strengthen the call to action. Keep the same topic, tone and approximate length.",
  shorten:
    "Tighten this draft to roughly 60% of its current length. Keep the strongest hook and the call to action; drop everything that does not earn its place.",
  expand:
    "Expand this draft with one more substantive idea — a concrete example, a specific benefit or a short story beat. Do not pad with adjectives.",
  rewrite:
    "Rewrite this post from scratch with a different structure and a different opening hook. Same brief, same tone, genuinely new copy.",
  tone: "Rewrite this post in the requested tone. Keep the substance and structure; change the voice.",
};

export function buildRefinePrompt(
  task: AiTask,
  brief: ContentBrief,
  current: GeneratedContent,
  instruction?: string,
): string {
  const range = targetCharRange(brief);
  const base =
    task === "regenerate"
      ? "Produce a completely new post for this brief. Do not reuse the previous hook, structure or phrasing."
      : REFINE_INSTRUCTION[task as keyof typeof REFINE_INSTRUCTION];

  const parts = [
    base,
    "",
    briefBlock(brief),
    "",
    platformBlock(brief, range),
    "",
    "Current draft:",
    current.headline ? `Headline: ${current.headline}` : "Headline: (none)",
    `Caption:\n${current.caption}`,
    `Hashtags: ${current.hashtags.join(", ") || "(none)"}`,
    `CTA: ${current.cta || "(none)"}`,
  ];
  if (instruction) parts.push("", `Reviewer instruction to follow: ${instruction}`);
  return parts.join("\n");
}

export function buildQualityPrompt(brief: ContentBrief, content: GeneratedContent): string {
  const spec = platformSpec(brief.platform);
  return [
    `Score this ${spec.name} post against the brief it was written from.`,
    "",
    briefBlock(brief),
    "",
    "Draft under review:",
    content.headline ? `Headline: ${content.headline}` : "Headline: (none)",
    `Caption:\n${content.caption}`,
    `Hashtags: ${content.hashtags.join(", ") || "(none)"}`,
    `CTA: ${content.cta || "(none)"}`,
    "",
    "Return clarity, relevance, engagement and brandSafety as numbers from 0-100, plus up to three strengths, risks and concrete suggestions.",
  ].join("\n");
}
