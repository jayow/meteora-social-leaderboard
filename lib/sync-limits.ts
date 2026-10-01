/** Owner-triggered syncs (profile load / Refresh). Shared by the sync route and the profile's Refresh button. */

/** After a successful sync, further requests get the stored snapshot until this has passed. */
export const SYNC_COOLDOWN_MS = 5 * 60 * 1000;

/** After a failed sync (e.g. Meteora down), wait this long before trying again. */
export const SYNC_RETRY_MS = 60 * 1000;
