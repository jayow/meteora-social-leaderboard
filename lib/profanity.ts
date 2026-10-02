/**
 * Profanity / slur check for user-chosen names. Client-safe and dependency-free.
 *
 * Text is folded before matching: NFKC (fullwidth -> ASCII), lowercase, common leetspeak
 * (0->o, 1->i, 3->e, 4->a, 5->s, 7->t, @->a, $->s ...), then checked two ways:
 * - SEVERE terms match anywhere, even with separators or stretched letters ("f.u.c.k", "fuuuck",
 *   "sh1t"), because they almost never occur inside innocent words.
 * - WORD terms match only as whole words, because they occur inside innocent ones
 *   ("ass" in Cassidy, "dick" in Dickens, "cock" in cocktail, "cunt" in Scunthorpe).
 */

const SEVERE = [
  "fuck", "shit", "bitch", "asshole", "bastard", "whore", "twat", "jizz", "dildo", "porn", "vagina",
  "nazi", "hitler", "paedo", "molest", "nigger", "nigga", "nigg", "faggot", "tranny", "wetback",
];

/** Whole words only: each also appears inside innocent words (spice, therapist, torpedo, swank...). */
const WORD = [
  "ass", "arse", "cunt", "cock", "dick", "pussy", "cum", "sex", "rape", "rapist", "fag", "coon", "gook",
  "hoe", "tit", "tits", "boob", "boobs", "anal", "anus", "nude", "nudes", "scam", "kkk", "slut", "sluts",
  "spic", "spics", "chink", "chinks", "kike", "kikes", "pedo", "pedos", "retard", "retards", "retarded",
  "wank", "wanker", "penis",
];

const LEET: Record<string, string> = { "0": "o", "1": "i", "2": "z", "3": "e", "4": "a", "5": "s", "6": "g", "7": "t", "8": "b", "9": "g", "@": "a", $: "s", "!": "i", "|": "i", "+": "t" };

function fold(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "") // strip accents so "fück" folds to "fuck"
    .replace(/[0-9@$!|+]/g, (c) => LEET[c] ?? c);
}

/** Collapse stretched letters (3+ in a row): "fuuuck" -> "fuck". Doubles stay ("shiitake"). */
const squeeze = (s: string) => s.replace(/(.)\1{2,}/g, "$1");

const SEVERE_FORMS = SEVERE.flatMap((t) => [t, squeeze(t)]);
const WORD_SET = new Set(WORD.flatMap((t) => [t, squeeze(t)]));

/** True when the text contains profanity or a slur. */
export function containsProfanity(text: string): boolean {
  const words = fold(text).split(/[^a-z]+/).filter(Boolean);
  // Spelled-out letters ("f u c k", "f.u.c.k") are rejoined; ordinary words are not glued together,
  // so "Sushi Tycoon" doesn't read as "su-shit-ycoon".
  const spelled: string[] = [];
  let run = "";
  for (const w of words) {
    if (w.length === 1) run += w;
    else {
      if (run.length > 1) spelled.push(run);
      run = "";
    }
  }
  if (run.length > 1) spelled.push(run);
  const candidates = [...words, ...spelled];
  if (candidates.some((c) => SEVERE_FORMS.some((t) => c.includes(t) || squeeze(c).includes(t)))) return true;
  return candidates.some((w) => WORD_SET.has(w) || WORD_SET.has(squeeze(w)));
}
