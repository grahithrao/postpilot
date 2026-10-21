import type { ContentType, Platform, Tone } from "@prisma/client";
import { platformSpec } from "@/lib/constants/platforms";
import { targetCharRange } from "@/lib/ai/prompts";
import type { ContentBrief, GeneratedContent } from "@/lib/ai/types";

/**
 * The deterministic copy engine behind DEMO MODE.
 *
 * It is not a language model - it is a compositional template system seeded by
 * the brief, so the same brief yields the same post and a "regenerate" yields a
 * genuinely different one. The point is that every workflow in the product can
 * be demonstrated end to end with no API key and no network access.
 */

/** Mulberry32 - small, fast, and reproducible from a string seed. */
function makeRng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;
const pick = <T,>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)] as T;

function pickMany<T>(rng: Rng, xs: readonly T[], n: number): T[] {
  const pool = [...xs];
  const out: T[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0] as T);
  return out;
}

/**
 * Lower-cases the first character only when the value is not a proper noun.
 * Briefs are written in sentence case ("why weekly reporting beats...") while
 * product names are capitalised ("Northwind Pulse", "API"), and mangling the
 * latter into "northwind Pulse" is the fastest way to make generated copy look
 * machine-made.
 */
const lower = (s: string) => {
  if (!s) return s;
  const first = s[0]!;
  return first === first.toUpperCase() && first !== first.toLowerCase() ? s : first.toLowerCase() + s.slice(1);
};
const title = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

// --- Building blocks --------------------------------------------------------

const HOOKS: Record<ContentType, readonly string[]> = {
  SOCIAL_POST: [
    "Most teams get {topic} wrong for the same three reasons.",
    "We changed how we think about {topic} this quarter. Here is what happened.",
    "{Topic}, in one sentence: it is a habit, not a project.",
    "Nobody talks about the unglamorous part of {topic}.",
  ],
  PROMOTIONAL: [
    "You should not need a six-week rollout to see value from {topic}.",
    "The fastest win here is the one you can ship this week, and it starts with {topic}.",
    "If your team is still losing hours every week, start with {topic}.",
    "We built the thing we wished existed when we were handling {topic} by hand.",
  ],
  EDUCATIONAL: [
    "Here is the checklist we actually use for {topic}.",
    "Three things nobody tells you about {topic}:",
    "A short field guide to {topic}, minus the theory.",
    "If you only change one thing about {topic}, make it this.",
  ],
  ANNOUNCEMENT: [
    "Some news about {topic}.",
    "Today we are sharing something we have been working on for a while: {topic}.",
    "It is official. {Topic} is here.",
    "A quick update on {topic}.",
  ],
  PRODUCT_LAUNCH: [
    "It is live. {Product} is available today.",
    "We are launching {product}, and it started with a complaint from our own team.",
    "Six months of work, one launch day: {product}.",
    "Say hello to {product}.",
  ],
  EVENT_PROMOTION: [
    "We are getting a room together to talk about {topic}. You should come.",
    "Save the date: we are going deep on {topic}.",
    "One hour, no slides about slides, all {topic}.",
    "Doors open soon for our session on {topic}.",
  ],
  ENGAGEMENT: [
    "Honest question: what is the hardest part of {topic} for your team?",
    "Unpopular opinion about {topic} - tell us we are wrong.",
    "We keep hearing two very different takes on {topic}. Which camp are you in?",
    "Fill in the blank: {topic} would be so much easier if ______.",
  ],
};

const BODY_BEATS: Record<ContentType, readonly string[]> = {
  SOCIAL_POST: [
    "The teams that make progress treat it as a weekly rhythm rather than a quarterly scramble.",
    "Small, boring consistency beats a big push every time.",
    "The work that moves the needle rarely looks impressive on the day you do it.",
  ],
  PROMOTIONAL: [
    "Set it up once, and it keeps working while you are doing something more interesting.",
    "No migration project. No six-month contract. Start on a Tuesday and see results by Friday.",
    "It slots into the tools your team already opens every morning.",
  ],
  EDUCATIONAL: [
    "Start with what already works and write it down. You cannot improve a process that only lives in someone's head.",
    "Measure one thing for four weeks before you change anything. Baselines beat opinions.",
    "Automate the step your team complains about most, not the step that is easiest to automate.",
  ],
  ANNOUNCEMENT: [
    "This has been the single most requested change from the people who use this every day.",
    "Nothing you already rely on changes. This sits alongside it.",
    "We shipped it small on purpose so we can keep improving it with you.",
  ],
  PRODUCT_LAUNCH: [
    "Everything works on day one, and the parts that matter most are the ones you will stop thinking about.",
    "We tested it with real teams for two months before opening it up.",
    "It is designed to disappear into your workflow rather than add another tab.",
  ],
  EVENT_PROMOTION: [
    "Expect real numbers, real mistakes and a proper Q and A rather than a sales pitch.",
    "Bring a question. The best part of these sessions is always the second half.",
    "It is recorded, so register even if the time does not work for you.",
  ],
  ENGAGEMENT: [
    "We have seen both approaches work, and both fail, depending entirely on team size.",
    "Our own answer changed twice this year, which is what makes it worth asking.",
    "There is no consensus in our team, so we are genuinely asking.",
  ],
};

const AUDIENCE_LINES = [
  "If you lead {audience}, this is probably already on your list.",
  "Built with {audience} in mind.",
  "Written for {audience} who do not have a spare quarter to spend on this.",
  "Every {audience} we spoke to said a version of the same thing.",
];

const PRODUCT_LINES = [
  "{Product} handles the repetitive half so your team keeps the judgement calls.",
  "That is exactly what we built {product} to do.",
  "With {product}, the whole loop takes minutes instead of afternoons.",
  "{Product} is how we do it internally, and it is now open to everyone.",
];

const CTAS: Record<ContentType, readonly string[]> = {
  SOCIAL_POST: ["What would you add?", "Curious how other teams handle this.", "Tell us how you approach it."],
  PROMOTIONAL: ["Start your free trial today.", "Book a 15-minute walkthrough.", "See it in action."],
  EDUCATIONAL: ["Save this for your next planning session.", "Share it with whoever owns this.", "Read the full guide."],
  ANNOUNCEMENT: ["Read the full announcement.", "See what changed.", "Take a look."],
  PRODUCT_LAUNCH: ["Try it free today.", "Get started in under five minutes.", "See the launch notes."],
  EVENT_PROMOTION: ["Save your seat.", "Register now.", "Grab a spot before they go."],
  ENGAGEMENT: ["Drop your take in the comments.", "Reply with your answer.", "Which is it for you?"],
};

const TONE_OPENERS: Partial<Record<Tone, readonly string[]>> = {
  CASUAL: ["Quick one.", "Real talk.", "Okay, quick thought."],
  FRIENDLY: ["Something worth sharing today.", "A small thing that made a big difference for us."],
  WITTY: ["Plot twist:", "Controversial take incoming.", "We tried it so you do not have to."],
  INSPIRATIONAL: ["Progress is quieter than people expect.", "The best teams we know share one habit."],
  BOLD: ["Let us be blunt.", "Here is the uncomfortable version."],
  EMPATHETIC: ["If this feels overwhelming right now, you are not alone.", "We have been on the wrong side of this too."],
};

const TONE_CLOSERS: Partial<Record<Tone, readonly string[]>> = {
  PROFESSIONAL: ["The details matter more than the strategy deck."],
  AUTHORITATIVE: ["The pattern has been consistent across every team size we have worked with."],
  INSPIRATIONAL: ["Start smaller than feels worthwhile. Then keep going."],
  EMPATHETIC: ["Be kind to your team while you fix it."],
  WITTY: ["You are welcome."],
};

const EMOJI: Partial<Record<ContentType, readonly string[]>> = {
  PRODUCT_LAUNCH: ["\u{1F680}", "\u{2728}"],
  ANNOUNCEMENT: ["\u{1F4E3}", "\u{2728}"],
  EVENT_PROMOTION: ["\u{1F4C5}", "\u{1F39F}"],
  PROMOTIONAL: ["\u{26A1}"],
};

const GENERIC_TAGS: Record<Platform, readonly string[]> = {
  LINKEDIN: ["Leadership", "GrowthStrategy", "B2B", "FutureOfWork", "OperationalExcellence"],
  X: ["BuildInPublic", "Startups", "Tech"],
  INSTAGRAM: ["BehindTheScenes", "SmallBusiness", "TeamCulture", "WorkLife", "DailyInspiration", "CreatorEconomy"],
  FACEBOOK: ["Community", "SmallBusiness", "Updates"],
};

const IMAGE_STYLES = [
  "editorial photography, soft directional window light, shallow depth of field, muted palette",
  "clean 3D isometric illustration, pastel gradient background, soft ambient occlusion",
  "candid documentary photography, natural light, warm neutral tones, 35mm",
  "minimal flat vector illustration, generous negative space, two-tone accent palette",
];

// --- Helpers ----------------------------------------------------------------

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "your", "our", "their", "about", "into", "using",
  "how", "why", "what", "when", "have", "will", "make", "more", "than", "them", "they", "been", "being",
  // Function words and vague qualifiers that make poor hashtags on their own.
  "does", "actually", "every", "really", "quite", "just", "only", "also", "would", "could", "should",
  "here", "there", "these", "those", "while", "which", "where", "still", "even", "over", "under",
  "one", "two", "three", "four", "five", "ten", "twenty", "hundred", "week", "weeks", "day", "days",
]);

/**
 * Hashtag candidates from free text.
 *
 * Adjacent word pairs come first, because real hashtags are usually compound
 * ("#WeeklyReporting"), and single words are only used when they are long
 * enough to stand on their own — which keeps stray fillers like "#Twenty" out.
 */
function topicHashtagCandidates(topic: string): string[] {
  const words = topic
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));

  // Only the opening pair: later pairs straddle a phrase boundary and produce
  // nonsense like "#RitualsBeat".
  const leadPair = words.length > 1 ? [`${words[0]} ${words[1]}`] : [];

  return [...leadPair, ...words.filter((w) => w.length >= 6)];
}

function pascal(word: string): string {
  return word
    .split(/[\s_-]+/)
    .map((w) => title(w.toLowerCase()))
    .join("");
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => {
    const value = vars[k.toLowerCase()] ?? "";
    return k[0] === k[0]?.toUpperCase() ? title(value) : lower(value);
  });
}

function clampToLimit(caption: string, limit: number): string {
  if (caption.length <= limit) return caption;
  const cut = caption.slice(0, limit - 1);
  const lastBreak = Math.max(cut.lastIndexOf("\n\n"), cut.lastIndexOf(". "), cut.lastIndexOf("! "));
  return (lastBreak > limit * 0.5 ? cut.slice(0, lastBreak + 1) : cut).trimEnd();
}

// --- Public API -------------------------------------------------------------

export interface CopyEngineOptions {
  /** Bumped on every regenerate so repeated calls diverge. */
  variant?: number;
  /** Free-text steer from the reviewer, echoed into the copy where sensible. */
  instruction?: string;
}

export function composeContent(brief: ContentBrief, options: CopyEngineOptions = {}): GeneratedContent {
  const variant = options.variant ?? 0;
  const rng = makeRng(
    `${brief.topic}|${brief.platform}|${brief.contentType}|${brief.tone}|${brief.length}|${variant}`,
  );
  const spec = platformSpec(brief.platform);
  const [minChars, maxChars] = targetCharRange(brief);

  const vars: Record<string, string> = {
    topic: brief.topic,
    audience: brief.audience || "modern teams",
    product: brief.product || brief.topic,
  };

  const hook = fill(pick(rng, HOOKS[brief.contentType]), vars);
  const toneOpener = TONE_OPENERS[brief.tone] ? pick(rng, TONE_OPENERS[brief.tone]!) : null;
  const beats = pickMany(
    rng,
    BODY_BEATS[brief.contentType],
    brief.length === "SHORT" ? 1 : brief.length === "LONG" ? 3 : 2,
  );
  const audienceLine = brief.audience ? fill(pick(rng, AUDIENCE_LINES), vars) : null;
  const productLine = brief.product ? fill(pick(rng, PRODUCT_LINES), vars) : null;
  const closer = TONE_CLOSERS[brief.tone] ? pick(rng, TONE_CLOSERS[brief.tone]!) : null;
  const cta = brief.ctaRequest?.trim() || pick(rng, CTAS[brief.contentType]);

  // Weave the requested keywords into a sentence rather than listing them.
  const keywordLine =
    brief.keywords.length === 0
      ? null
      : brief.keywords.length === 1
        ? `It comes down to ${lower(brief.keywords[0]!)}.`
        : `It comes down to ${brief.keywords.slice(0, -1).map(lower).join(", ")} and ${lower(
            brief.keywords[brief.keywords.length - 1]!,
          )}.`;

  const instructionLine = options.instruction?.trim()
    ? `${title(options.instruction.trim().replace(/[.!?]+$/, ""))}.`
    : null;

  const paragraphs = [
    [toneOpener, hook].filter(Boolean).join(" "),
    beats.join(" "),
    [keywordLine, audienceLine].filter(Boolean).join(" "),
    [instructionLine, productLine].filter(Boolean).join(" "),
    closer,
  ].filter((p): p is string => Boolean(p && p.trim()));

  const emoji = EMOJI[brief.contentType];
  const useEmoji =
    emoji && brief.tone !== "PROFESSIONAL" && brief.tone !== "AUTHORITATIVE" && brief.platform !== "LINKEDIN";
  if (useEmoji && paragraphs[0]) paragraphs[0] = `${pick(rng, emoji)} ${paragraphs[0]}`;

  // X posts are a single tight block; everywhere else gets breathing room.
  // The keyword line travels with the X variant too, so requested keywords are
  // never dropped just because the platform is short-form.
  let caption =
    brief.platform === "X"
      ? [paragraphs[0], keywordLine ?? paragraphs[1] ?? "", cta]
          .filter(Boolean)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim()
      : `${paragraphs.join("\n\n")}\n\n${cta}`;

  // Grow toward the target range rather than shipping something anaemic.
  if (caption.length < minChars && brief.platform !== "X") {
    for (const beat of pickMany(rng, BODY_BEATS[brief.contentType], 3)) {
      if (caption.length >= minChars) break;
      if (caption.includes(beat)) continue;
      caption = caption.replace(`\n\n${cta}`, `\n\n${beat}\n\n${cta}`);
    }
  }
  caption = clampToLimit(caption, Math.min(spec.captionLimit, Math.max(maxChars, minChars) + 400));

  // Hashtags: brand-supplied first, then the keywords as whole phrases
  // ("saved views" -> #SavedViews, not #Saved #Views), then salient words from
  // the topic, then platform staples.
  const keywordTags = brief.keywords
    .map((k) => pascal(k.replace(/[^\p{L}\p{N}\s_-]/gu, "").trim()))
    .filter((t) => t.length > 2);
  const topicTags = topicHashtagCandidates(brief.topic).map(pascal).slice(0, 3);
  const wanted = Math.min(spec.idealHashtagRange[1], spec.hashtagLimit);
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const raw of [
    ...brief.hashtags.map((h) => h.replace(/^#/, "")),
    ...keywordTags,
    ...topicTags,
    ...GENERIC_TAGS[brief.platform],
  ]) {
    const key = raw.toLowerCase();
    if (!raw || seen.has(key)) continue;
    // Skip anything already contained in a chosen tag, so #SavedViews does not
    // get followed by a redundant #Saved.
    if (tags.some((t) => t.toLowerCase().includes(key) || key.includes(t.toLowerCase()))) continue;
    seen.add(key);
    tags.push(raw);
    if (tags.length >= wanted) break;
  }

  const headline = spec.supportsHeadline
    ? title(
        brief.contentType === "PRODUCT_LAUNCH"
          ? `Introducing ${brief.product || brief.topic}`
          : brief.contentType === "EVENT_PROMOTION"
            ? `Join us: ${brief.topic}`
            : brief.topic,
      ).slice(0, 120)
    : null;

  const subject = brief.product || brief.topic;
  const crop =
    brief.platform === "INSTAGRAM"
      ? "Square 1:1 crop."
      : brief.platform === "X"
        ? "Wide 16:9 crop."
        : "Landscape 1.91:1 crop.";
  const imagePrompt = `${title(subject)} - ${pick(
    rng,
    IMAGE_STYLES,
  )}. Composition leaves clear negative space in the upper third for copy. No text, no logos, no watermarks. ${crop}`;

  const bestHour = spec.bestHours[Math.floor(rng() * spec.bestHours.length)] ?? 9;
  const timingRationale = `${spec.name} engagement for ${
    brief.audience || "this audience"
  } peaks around ${bestHour}:00 local time on weekdays, when people scan feeds between focused work blocks.`;

  return { headline, caption, hashtags: tags, cta, imagePrompt, timingRationale };
}

/** Shorten / expand / improve applied to existing copy without a real model. */
export function transformContent(
  brief: ContentBrief,
  current: GeneratedContent,
  task: "improve" | "shorten" | "expand" | "rewrite" | "tone",
  options: CopyEngineOptions = {},
): GeneratedContent {
  const spec = platformSpec(brief.platform);
  const rng = makeRng(`${task}|${current.caption.length}|${brief.topic}|${options.variant ?? 0}`);

  if (task === "rewrite" || task === "tone") {
    return composeContent(brief, { ...options, variant: (options.variant ?? 0) + 7 });
  }

  const paragraphs = current.caption.split(/\n{2,}/).filter(Boolean);

  if (task === "shorten") {
    const keep = Math.max(2, Math.ceil(paragraphs.length * 0.55));
    const kept = paragraphs.length <= 2 ? paragraphs : [...paragraphs.slice(0, keep - 1), paragraphs.at(-1)!];
    const trimmed = kept.join("\n\n").replace(/\b(really|very|actually|basically|simply|just)\s+/gi, "");
    return { ...current, caption: clampToLimit(trimmed, spec.captionLimit) };
  }

  if (task === "expand") {
    const beat = pick(rng, BODY_BEATS[brief.contentType]);
    const extra = brief.audience
      ? `${beat} ${fill(pick(rng, AUDIENCE_LINES), { audience: brief.audience })}`
      : beat;
    const insertAt = Math.max(1, paragraphs.length - 1);
    const next = [...paragraphs.slice(0, insertAt), extra, ...paragraphs.slice(insertAt)].join("\n\n");
    return { ...current, caption: clampToLimit(next, spec.captionLimit) };
  }

  // improve: sharpen the opener, remove hedging, guarantee a CTA.
  const sharpened = paragraphs
    .join("\n\n")
    .replace(/\b(we think|we believe|in our opinion|it seems that|kind of|sort of)\s+/gi, "")
    .replace(/\b(leverage|utilise|utilize)\b/gi, "use")
    .replace(/\b(synergy|synergies)\b/gi, "overlap");
  const cta = current.cta || pick(rng, CTAS[brief.contentType]);
  const withCta = sharpened.includes(cta) ? sharpened : `${sharpened}\n\n${cta}`;

  return {
    ...current,
    cta,
    caption: clampToLimit(brief.platform === "X" ? withCta.replace(/\n{2,}/g, " ") : withCta, spec.captionLimit),
  };
}
