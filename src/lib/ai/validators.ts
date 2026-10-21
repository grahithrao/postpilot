import { platformSpec } from "@/lib/constants/platforms";
import type { ContentBrief, GeneratedContent, QualityCheck } from "./types";

/**
 * Deterministic content validation.
 *
 * These checks run in code, not in the model, so a persuasive draft cannot talk
 * its way past a hard platform limit. The LLM's subjective judgement is layered
 * on top of this in the quality gate, never instead of it.
 */

const BUZZWORDS = [
  "synergy", "leverage", "paradigm", "game-changer", "game changer", "revolutionary",
  "cutting-edge", "best-in-class", "world-class", "seamlessly", "unlock the power",
  "take it to the next level", "move the needle", "circle back", "low-hanging fruit",
];

const PLACEHOLDERS = [
  "[insert", "{{", "lorem ipsum", "your company name", "xyz company", "todo:", "tbd",
  "as an ai language model", "here is a", "here's a post",
];

const RISKY_CLAIMS = [
  "guaranteed", "100% effective", "cure", "risk-free", "no risk", "get rich",
  "best in the world", "number one in the world",
];

const URL_RE = /https?:\/\/[^\s]+/gi;

/**
 * Keyword matching tolerant of ordinary English inflection, so "dashboards" in
 * the brief is satisfied by "dashboard" in the copy. A stricter exact match
 * produced false failures that made otherwise good drafts look broken.
 */
function mentionsKeyword(haystack: string, keyword: string): boolean {
  const phrase = keyword.toLowerCase().trim();
  if (!phrase) return true;
  if (haystack.includes(phrase)) return true;

  return phrase.split(/\s+/).every((word) => {
    const stem = word.replace(/(ies|es|s)$/i, "").replace(/(ing|ed)$/i, "");
    return stem.length >= 3 && haystack.includes(stem);
  });
}
const EMOJI_RE = /\p{Extended_Pictographic}/gu;

export interface ValidationOutcome {
  checks: QualityCheck[];
  /** Blocking problems. A post with any of these cannot score above 59. */
  hardViolations: string[];
  /** 0-100 score derived purely from the deterministic rules. */
  structuralScore: number;
}

export function validateContent(brief: ContentBrief, content: GeneratedContent): ValidationOutcome {
  const spec = platformSpec(brief.platform);
  const checks: QualityCheck[] = [];
  const hardViolations: string[] = [];
  const caption = content.caption ?? "";
  const haystack = `${content.headline ?? ""}\n${caption}\n${content.cta ?? ""}`.toLowerCase();

  // 1. Hard character limit -------------------------------------------------
  const fullLength = caption.length + content.hashtags.reduce((n, h) => n + h.length + 2, 0);
  if (fullLength > spec.captionLimit) {
    const detail = `${fullLength} characters including hashtags exceeds the ${spec.name} limit of ${spec.captionLimit}.`;
    checks.push({ id: "length-limit", label: "Character limit", status: "fail", detail });
    hardViolations.push(detail);
  } else {
    const [lo, hi] = spec.idealCaptionRange;
    const inBand = caption.length >= lo * 0.7 && caption.length <= hi;
    checks.push({
      id: "length-limit",
      label: "Character limit",
      status: inBand ? "pass" : "warn",
      detail: inBand
        ? `${fullLength} of ${spec.captionLimit} characters - comfortably inside the ${spec.name} limit.`
        : `${fullLength} characters. ${spec.name} posts perform best between ${lo} and ${hi}.`,
    });
  }

  // 2. Hashtags -------------------------------------------------------------
  const tagCount = content.hashtags.length;
  if (tagCount > spec.hashtagLimit) {
    const detail = `${tagCount} hashtags exceeds the ${spec.name} maximum of ${spec.hashtagLimit}.`;
    checks.push({ id: "hashtags", label: "Hashtags", status: "fail", detail });
    hardViolations.push(detail);
  } else {
    const [lo, hi] = spec.idealHashtagRange;
    const ideal = tagCount >= lo && tagCount <= hi;
    checks.push({
      id: "hashtags",
      label: "Hashtags",
      status: ideal ? "pass" : "warn",
      detail: ideal
        ? `${tagCount} hashtags - on target for ${spec.name}.`
        : `${tagCount} hashtags. ${spec.name} performs best with ${lo}-${hi}.`,
    });
  }

  // 3. Call to action -------------------------------------------------------
  const hasCta = Boolean(content.cta?.trim());
  checks.push({
    id: "cta",
    label: "Call to action",
    status: hasCta ? "pass" : "warn",
    detail: hasCta ? `Present: "${content.cta}"` : "No call to action - the reader is not told what to do next.",
  });

  // 4. Placeholders and model artefacts ------------------------------------
  const placeholder = PLACEHOLDERS.find((p) => haystack.includes(p));
  if (placeholder) {
    const detail = `Draft still contains an unresolved placeholder or model artefact ("${placeholder}").`;
    checks.push({ id: "placeholders", label: "Placeholders", status: "fail", detail });
    hardViolations.push(detail);
  } else {
    checks.push({
      id: "placeholders",
      label: "Placeholders",
      status: "pass",
      detail: "No placeholders or model artefacts detected.",
    });
  }

  // 5. Risky claims ---------------------------------------------------------
  const risky = RISKY_CLAIMS.filter((c) => haystack.includes(c));
  checks.push({
    id: "claims",
    label: "Claim safety",
    status: risky.length ? "warn" : "pass",
    detail: risky.length
      ? `Contains claims a legal reviewer may object to: ${risky.join(", ")}.`
      : "No absolute or unverifiable claims detected.",
  });

  // 6. Buzzword density -----------------------------------------------------
  const buzz = BUZZWORDS.filter((b) => haystack.includes(b));
  checks.push({
    id: "buzzwords",
    label: "Plain language",
    status: buzz.length > 2 ? "warn" : "pass",
    detail: buzz.length
      ? `Corporate filler detected: ${buzz.slice(0, 4).join(", ")}.`
      : "Reads as plain, specific language.",
  });

  // 7. Platform link rules --------------------------------------------------
  const urls = caption.match(URL_RE) ?? [];
  if (!spec.supportsLinkInCaption && urls.length > 0) {
    const detail = `${spec.name} captions do not render clickable links, but the draft contains ${urls.length}.`;
    checks.push({ id: "links", label: "Link handling", status: "warn", detail });
  } else {
    checks.push({
      id: "links",
      label: "Link handling",
      status: "pass",
      detail: spec.supportsLinkInCaption
        ? `${urls.length} link(s) - clickable on ${spec.name}.`
        : `No bare links, which is correct for ${spec.name}.`,
    });
  }

  // 8. Keyword coverage -----------------------------------------------------
  if (brief.keywords.length) {
    const missing = brief.keywords.filter((k) => !mentionsKeyword(haystack, k));
    checks.push({
      id: "keywords",
      label: "Keyword coverage",
      status: missing.length === 0 ? "pass" : missing.length === brief.keywords.length ? "fail" : "warn",
      detail:
        missing.length === 0
          ? `All ${brief.keywords.length} requested keywords appear naturally.`
          : `Missing from the copy: ${missing.join(", ")}.`,
    });
    if (missing.length === brief.keywords.length) {
      hardViolations.push("None of the requested keywords appear in the copy.");
    }
  }

  // 9. Emoji restraint ------------------------------------------------------
  const emojiCount = (caption.match(EMOJI_RE) ?? []).length;
  const emojiCap = brief.platform === "INSTAGRAM" ? 8 : brief.platform === "LINKEDIN" ? 2 : 4;
  checks.push({
    id: "emoji",
    label: "Emoji restraint",
    status: emojiCount > emojiCap ? "warn" : "pass",
    detail:
      emojiCount > emojiCap
        ? `${emojiCount} emoji is heavy for ${spec.name} (${emojiCap} or fewer reads better).`
        : `${emojiCount} emoji - appropriate for ${spec.name}.`,
  });

  // 10. Media requirement ---------------------------------------------------
  if (spec.requiresMedia) {
    const hasPrompt = Boolean(content.imagePrompt?.trim());
    checks.push({
      id: "media",
      label: "Visual asset",
      status: hasPrompt ? "pass" : "fail",
      detail: hasPrompt
        ? "An image prompt is attached, which Instagram requires."
        : "Instagram posts require a visual, and no image prompt was produced.",
    });
    if (!hasPrompt) hardViolations.push("Instagram requires a visual and none is attached.");
  }

  // 11. Structural readability ---------------------------------------------
  const paragraphs = caption.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  const longestParagraph = Math.max(0, ...paragraphs.map((p) => p.length));
  const readable = brief.platform === "X" || longestParagraph <= 600;
  checks.push({
    id: "readability",
    label: "Scannability",
    status: readable ? "pass" : "warn",
    detail: readable
      ? `${paragraphs.length} paragraph(s) - easy to scan on mobile.`
      : `One paragraph runs to ${longestParagraph} characters. Break it up for mobile readers.`,
  });

  const failWeight = checks.filter((c) => c.status === "fail").length * 22;
  const warnWeight = checks.filter((c) => c.status === "warn").length * 6;
  const structuralScore = Math.max(0, Math.min(100, 100 - failWeight - warnWeight));

  return { checks, hardViolations, structuralScore };
}

/** Score below which the agent will not let a draft reach a human unflagged. */
export const MIN_PUBLISHABLE_SCORE = 60;
