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
