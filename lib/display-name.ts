import { containsProfanity } from "@/lib/profanity";

/**
 * Custom display names for members without X (they replace the random beach name in users.anon_name).
 * Client-safe: the same rules run in the edit field and in PATCH /api/users/me.
 */

export const DISPLAY_NAME_MIN = 3;
export const DISPLAY_NAME_MAX = 24;
/** Letters (any language), numbers, spaces and - _ . ' ; no "@" so it can't pass for an X handle. */
const ALLOWED = /^[\p{L}\p{N}][\p{L}\p{N} _.'-]*$/u;
/** Names that could pass for the app, Meteora or staff. */
const RESERVED = ["pool party", "poolparty", "lppool", "admin", "meteora", "official", "support", "moderator", "mod team"];

/** NFKC (folds fullwidth / stylised letters to plain ones), trim, collapse inner spaces. */
export function normalizeDisplayName(raw: string): string {
  return raw.normalize("NFKC").trim().replace(/\s+/g, " ");
}

/**
 * Lookalike scripts that are used to impersonate ("Pаul" with a Cyrillic "а"). A name may use any
 * one of them, plus other scripts (e.g. Japanese mixes Han and kana), but not two of these.
 */
const CONFUSABLE_SCRIPTS = [/\p{Script=Latin}/u, /\p{Script=Cyrillic}/u, /\p{Script=Greek}/u];
const mixesLookalikeScripts = (name: string) => CONFUSABLE_SCRIPTS.filter((re) => re.test(name)).length > 1;

/** null when valid, otherwise the message to show. Uniqueness is checked by the server. */
export function displayNameError(name: string): string | null {
  if (name.length < DISPLAY_NAME_MIN) return `Use at least ${DISPLAY_NAME_MIN} characters`;
  if (name.length > DISPLAY_NAME_MAX) return `Use at most ${DISPLAY_NAME_MAX} characters`;
  if (!ALLOWED.test(name)) return "Use letters, numbers, spaces, - _ . or '";
  const lower = name.toLowerCase();
  if (RESERVED.some((r) => lower.includes(r))) return "That name is reserved";
  if (mixesLookalikeScripts(name)) return "Don't mix alphabets in one name";
  if (containsProfanity(name)) return "Please choose a different name";
  return null;
}
