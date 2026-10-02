/**
 * Client-side "the signed-in user changed" signal (sign-in, joining the beta, linking X, ...).
 * Components that cache /api/auth/session or the current user's profile listen for it and refetch,
 * so the header and profile update immediately without a full page reload.
 */
export const SESSION_CHANGED_EVENT = "pp:session-changed";

export function notifySessionChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
}

export function onSessionChanged(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(SESSION_CHANGED_EVENT, listener);
  return () => window.removeEventListener(SESSION_CHANGED_EVENT, listener);
}

/** Ask the app shell to open the Sign in modal (e.g. a signed-out user clicked Follow). */
export const SIGN_IN_REQUESTED_EVENT = "pp:sign-in-requested";

export function requestSignIn(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SIGN_IN_REQUESTED_EVENT));
}

export function onSignInRequested(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(SIGN_IN_REQUESTED_EVENT, listener);
  return () => window.removeEventListener(SIGN_IN_REQUESTED_EVENT, listener);
}

/** Ask the app shell to open the wallet picker in "link" mode (adds a wallet to the signed-in account). */
export const WALLET_LINK_REQUESTED_EVENT = "pp:wallet-link-requested";

export function requestWalletLink(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(WALLET_LINK_REQUESTED_EVENT));
}

export function onWalletLinkRequested(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(WALLET_LINK_REQUESTED_EVENT, listener);
  return () => window.removeEventListener(WALLET_LINK_REQUESTED_EVENT, listener);
}

/**
 * Follow state changed for `targetId`. Fired optimistically on click (no count), again with the
 * server's follower count on success, and with the reverted state on failure. Every Follow button
 * for that user and every follower count on screen listens, so they stay in sync.
 */
export interface FollowChange {
  targetId: number;
  following: boolean;
  /** Authoritative follower count from the server, when known. */
  followersCount?: number;
  /** The signed-in viewer's own following count after the change, when known. */
  viewerFollowingCount?: number;
}

export const FOLLOW_CHANGED_EVENT = "pp:follow-changed";

export function notifyFollowChanged(change: FollowChange): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<FollowChange>(FOLLOW_CHANGED_EVENT, { detail: change }));
}

export function onFollowChanged(listener: (change: FollowChange) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = (e: Event) => listener((e as CustomEvent<FollowChange>).detail);
  window.addEventListener(FOLLOW_CHANGED_EVENT, handler);
  return () => window.removeEventListener(FOLLOW_CHANGED_EVENT, handler);
}

/**
 * Apply a follow change to a user-like record: exact count when the server sent one, otherwise
 * +/-1 only if the state actually flipped (so repeated events are idempotent).
 */
export function applyFollowChange<T extends { id: number; isFollowing?: boolean; followersCount?: number }>(u: T, change: FollowChange): T {
  if (u.id !== change.targetId) return u;
  const flipped = Boolean(u.isFollowing) !== change.following;
  let followersCount = u.followersCount;
  if (change.followersCount !== undefined) followersCount = change.followersCount;
  else if (flipped && followersCount !== undefined) followersCount = Math.max(0, followersCount + (change.following ? 1 : -1));
  if (!flipped && followersCount === u.followersCount) return u;
  return { ...u, isFollowing: change.following, followersCount };
}
