/**
 * Client-safe types for theses (token_comments) wherever they render: Poolside, the pool page and
 * profiles. No wallet fields, ever.
 */

export interface ThesisAuthor {
  id: number;
  xHandle: string | null;
  xName: string | null;
  xAvatarUrl: string | null;
  anonName: string | null;
  /** Joined members have a public profile to link to. */
  hasProfile: boolean;
}

export interface ThesisPool {
  address: string;
  /** "SI-SOL" */
  name: string;
  xIcon: string | null;
  yIcon: string | null;
  binStep: number | null;
  protocol: string | null;
}

export interface ThesisPost {
  id: number;
  body: string;
  createdAt: string;
  author: ThesisAuthor;
  token: { mint: string; symbol: string | null; icon: string | null };
  /** The pool the author posted from (they held it at post time). Null only for old untagged rows. */
  pool: ThesisPool | null;
  /** Author still has an open position in that pool (from the last sync). */
  authorInPool: boolean;
  likeCount: number;
  likedByViewer: boolean;
  /** Viewer wrote it (own posts can't be liked). */
  isOwn: boolean;
}

/** A pool the signed-in member holds, i.e. one they can post a thesis on. */
export interface ComposerPool {
  address: string;
  name: string;
  tokenMint: string;
  tokenSymbol: string;
  xIcon: string | null;
  yIcon: string | null;
  binStep: number | null;
  protocol: string | null;
  /** The member's open positions in this pool (from their last sync). */
  positionCount: number;
}

export interface ComposerResponse {
  signedIn: boolean;
  joined: boolean;
  me: ThesisAuthor | null;
  pools: ComposerPool[];
}

export interface ThesisLikeResponse {
  liked: boolean;
  likeCount: number;
}

/** Max thesis length (enforced by the comments API). */
export const THESIS_MAX_LENGTH = 500;
