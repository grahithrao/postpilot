/**
 * Content sanitisation for user- and AI-generated copy.
 *
 * All post content is rendered as plain text (never dangerouslySetInnerHTML),
 * so this is defence in depth: it strips control characters, removes invisible
 * code points and enforces sane lengths before anything is persisted or shipped
 * to a platform API.
 *
 * The patterns are built with `new RegExp` from escaped strings so the source
 * file itself stays plain ASCII.
 */

/** C0/C1 control characters, preserving tab (U+0009) and newline (U+000A). */
const CONTROL_CHARS = new RegExp("[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F-\\x9F]", "g");

/**
 * Zero-width, bidi-override and BOM characters - commonly used to smuggle
 * invisible payloads into text or to reverse how it renders.
 */
const ZERO_WIDTH = new RegExp("[\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2064\\uFEFF]", "g");

export function sanitizeText(input: string, maxLength = 8000): string {
  return input
    .replace(/\r\n/g, "\n")
    .replace(CONTROL_CHARS, "")
    .replace(ZERO_WIDTH, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trimEnd()
    .slice(0, maxLength);
}

export function sanitizeSingleLine(input: string, maxLength = 300): string {
  return sanitizeText(input, maxLength * 2).replace(/\s+/g, " ").trim().slice(0, maxLength);
}

/** Normalises a hashtag to `#word` form, dropping anything unusable. */
export function sanitizeHashtag(input: string): string | null {
  const cleaned = input
    .replace(CONTROL_CHARS, "")
    .replace(ZERO_WIDTH, "")
    .replace(/[^\p{L}\p{N}_#]/gu, "")
    .replace(/^#+/, "")
    .slice(0, 60);
  return cleaned.length ? `#${cleaned}` : null;
}

export function sanitizeHashtags(input: string[], max = 30): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const tag = sanitizeHashtag(raw);
    if (!tag) continue;
    const k = tag.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(tag);
    if (out.length >= max) break;
  }
  return out;
}

export function sanitizeKeywords(input: string[], max = 20): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const k = sanitizeSingleLine(raw, 60);
    if (!k) continue;
    const lower = k.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(k);
    if (out.length >= max) break;
  }
  return out;
}
