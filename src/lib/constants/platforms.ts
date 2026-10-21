import type { Platform } from "@prisma/client";

export interface PlatformSpec {
  id: Platform;
  name: string;
  /** Hard character cap enforced by the platform API. */
  captionLimit: number;
  /** What the copywriter should aim for — shorter than the hard cap. */
  idealCaptionRange: [number, number];
  hashtagLimit: number;
  idealHashtagRange: [number, number];
  supportsHeadline: boolean;
  supportsLinkInCaption: boolean;
  requiresMedia: boolean;
  /** Tailwind classes for the platform chip. */
  accent: string;
  dot: string;
  handlePrefix: string;
  /** Hours (local) that historically perform best — used for suggested times. */
  bestHours: number[];
  guidance: string;
}

export const PLATFORMS: Record<Platform, PlatformSpec> = {
  LINKEDIN: {
    id: "LINKEDIN",
    name: "LinkedIn",
    captionLimit: 3000,
    idealCaptionRange: [600, 1600],
    hashtagLimit: 10,
    idealHashtagRange: [3, 5],
    supportsHeadline: true,
    supportsLinkInCaption: true,
    requiresMedia: false,
    accent: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/25",
    dot: "bg-sky-500",
    handlePrefix: "in/",
    bestHours: [8, 9, 12, 17],
    guidance:
      "Professional and insight-led. Open with a hook line, use short paragraphs and white space, close with a question or clear CTA. Avoid hashtag stuffing.",
  },
  X: {
    id: "X",
    name: "X",
    captionLimit: 280,
    idealCaptionRange: [120, 260],
    hashtagLimit: 3,
    idealHashtagRange: [1, 2],
    supportsHeadline: false,
    supportsLinkInCaption: true,
    requiresMedia: false,
    accent: "bg-neutral-900/10 text-neutral-900 dark:bg-white/10 dark:text-neutral-100 border-neutral-500/25",
    dot: "bg-neutral-900 dark:bg-neutral-100",
    handlePrefix: "@",
    bestHours: [9, 12, 15, 18],
    guidance:
      "Punchy and conversational. One idea per post, front-load the hook, keep it well under 280 characters including hashtags.",
  },
  INSTAGRAM: {
    id: "INSTAGRAM",
    name: "Instagram",
    captionLimit: 2200,
    idealCaptionRange: [150, 800],
    hashtagLimit: 30,
    idealHashtagRange: [8, 15],
    supportsHeadline: false,
    supportsLinkInCaption: false,
    requiresMedia: true,
    accent: "bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/25",
    dot: "bg-gradient-to-br from-amber-400 via-pink-500 to-purple-600",
    handlePrefix: "@",
    bestHours: [11, 13, 19, 20],
    guidance:
      "Visual-first and warm. Lead with an emotive hook, use line breaks and a light touch of emoji, and remember links are not clickable in captions.",
  },
  FACEBOOK: {
    id: "FACEBOOK",
    name: "Facebook",
    captionLimit: 63206,
    idealCaptionRange: [250, 900],
    hashtagLimit: 6,
    idealHashtagRange: [2, 4],
    supportsHeadline: true,
    supportsLinkInCaption: true,
    requiresMedia: false,
    accent: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25",
    dot: "bg-blue-600",
    handlePrefix: "/",
    bestHours: [9, 13, 15, 19],
    guidance:
      "Community-oriented and story-driven. Conversational opener, a clear takeaway, and a CTA that invites replies or shares.",
  },
};

export const PLATFORM_LIST = Object.values(PLATFORMS);

export function platformSpec(platform: Platform): PlatformSpec {
  return PLATFORMS[platform];
}

export const PLATFORM_LABEL: Record<Platform, string> = {
  LINKEDIN: "LinkedIn",
  X: "X",
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
};
