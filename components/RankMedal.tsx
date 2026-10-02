/**
 * Gold / silver / bronze mark for leaderboard ranks 1-3 (inline SVG, flat metal tones, no gradients).
 * Tokens live in app/globals.css (`gold`, `silver`, `bronze`); see THEME.md "Medals".
 */
export type MedalRank = 1 | 2 | 3;

export const isMedalRank = (rank: number | null | undefined): rank is MedalRank => rank === 1 || rank === 2 || rank === 3;

/** Literal class names per metal (kept static so Tailwind can see them). */
export const MEDAL = {
  1: { label: "Gold", text: "text-gold", ring: "border-gold" },
  2: { label: "Silver", text: "text-silver", ring: "border-silver" },
  3: { label: "Bronze", text: "text-bronze", ring: "border-bronze" },
} as const satisfies Record<MedalRank, { label: string; text: string; ring: string }>;

const ORDINAL: Record<MedalRank, string> = { 1: "1st", 2: "2nd", 3: "3rd" };

/** Ribboned medal with the rank on it. `size` is the rendered height in px. */
export function RankMedal({ rank, size = 28, className = "" }: { rank: MedalRank; size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 28"
      width={(size * 24) / 28}
      height={size}
      role="img"
      aria-label={`${ORDINAL[rank]} place`}
      className={`shrink-0 ${MEDAL[rank].text} ${className}`}
      data-testid="rank-medal"
    >
      <path d="M4 0h6l4 11H8z" fill="currentColor" fillOpacity={0.45} />
      <path d="M20 0h-6l-4 11h6z" fill="currentColor" fillOpacity={0.7} />
      <circle cx="12" cy="18.5" r="9.5" fill="currentColor" />
      <circle cx="12" cy="18.5" r="7.25" fill="none" stroke="var(--color-bg)" strokeOpacity={0.28} strokeWidth="1" />
      <text x="12" y="22.2" textAnchor="middle" fontSize="10.5" fontWeight="700" fill="var(--color-bg)" fontFamily="inherit">
        {rank}
      </text>
    </svg>
  );
}

/** Avatar wrapped in a solid metal ring (2px border + gap). */
export function MedalRing({ rank, children, className = "" }: { rank: MedalRank; children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex shrink-0 rounded-full border-2 p-[3px] ${MEDAL[rank].ring} ${className}`}>{children}</span>;
}

/** Podium layout shared by the members and countries boards: phones stack 1-2-3, `sm`+ uses DOM order (2-1-3). */
export const PODIUM_STACK_ORDER: Record<MedalRank, string> = { 1: "order-1 sm:order-none", 2: "order-2 sm:order-none", 3: "order-3 sm:order-none" };
export const PODIUM_GRID: Record<number, string> = { 1: "sm:max-w-[320px]", 2: "sm:max-w-[640px] sm:grid-cols-2", 3: "sm:max-w-[960px] sm:grid-cols-3" };

/**
 * One podium place, no card: phones get a divided row (ringed avatar, name + figure, action); from `sm`
 * an open column, #1 raised above #2 and #3, with a quiet surface on hover.
 */
export const PODIUM_SLOT =
  "group relative flex min-w-0 items-center gap-3.5 border-b border-border px-2 py-3 transition sm:flex-col sm:gap-0 sm:rounded-card sm:border-b-0 sm:px-4 sm:pb-6 sm:text-center sm:hover:bg-surface";
export const PODIUM_LIFT: Record<MedalRank, string> = { 1: "sm:pt-5", 2: "sm:pt-14", 3: "sm:pt-14" };
/** Podium wrapper: a hairline on top for the phone list; the open columns need none. */
export const PODIUM_WRAP = "mx-auto mt-6 grid border-t border-border sm:mt-8 sm:items-start sm:gap-3 sm:border-t-0";

/** Open list rows (members and countries): hairline dividers, a quiet surface on hover. */
export const LIST_ROW = "group relative flex min-w-0 items-center gap-3 border-b border-border px-2 py-2.5 transition hover:bg-surface sm:px-3";
/** List wrapper. With a podium above, phones continue its divided list (no extra rule); `sm`+ opens with a hairline. */
export function listWrap(twoCols: boolean, hasPodium: boolean): string {
  return `grid ${twoCols ? "lg:grid-flow-col lg:grid-cols-2 lg:gap-x-12" : "mx-auto max-w-[680px]"} ${
    hasPodium ? "sm:mt-8 sm:border-t sm:border-border" : "mt-6 border-t border-border"
  }`;
}

/** Medal pinned to the bottom of the ringed avatar / flag. */
export function MedalPin({ rank, first }: { rank: MedalRank; first: boolean }) {
  return (
    <RankMedal
      rank={rank}
      size={20}
      className={`pointer-events-none absolute -bottom-2 left-1/2 -translate-x-1/2 ${first ? "sm:-bottom-3 sm:h-9 sm:w-[31px]" : "sm:-bottom-3 sm:h-7 sm:w-6"}`}
    />
  );
}

/** Loading state matching the open podium and the divided two-column list. */
export function PodiumSkeleton({ testId = "board-skeleton" }: { testId?: string }) {
  return (
    <div aria-hidden data-testid={testId}>
      <div className={`${PODIUM_WRAP} ${PODIUM_GRID[3]}`}>
        {([2, 1, 3] as const).map((r) => (
          <div key={r} className={`${PODIUM_SLOT} ${PODIUM_STACK_ORDER[r]} ${PODIUM_LIFT[r]} sm:hover:bg-transparent`}>
            <span className={`skeleton shrink-0 rounded-full ${r === 1 ? "h-[58px] w-[58px] sm:h-[122px] sm:w-[122px]" : "h-[52px] w-[52px] sm:h-[94px] sm:w-[94px]"}`} />
            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:mt-6 sm:w-full sm:flex-none sm:items-center">
              <span className="skeleton block h-4 w-28" />
              <span className={`skeleton block w-24 ${r === 1 ? "h-7 sm:h-10 sm:w-36" : "h-7 sm:h-8 sm:w-28"}`} />
            </div>
            {/* Follow button placeholder, so the loaded columns don't grow. */}
            <span className="skeleton block h-8 w-20 shrink-0 rounded-full sm:mt-4" />
          </div>
        ))}
      </div>
      <div className={listWrap(true, true)} style={{ gridTemplateRows: "repeat(5, minmax(0, auto))" }}>
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className={`${LIST_ROW} hover:bg-transparent`}>
            <span className="skeleton block h-3 w-5" />
            <span className="skeleton h-8 w-8 shrink-0 rounded-full" />
            <span className="skeleton block h-4 flex-1" style={{ maxWidth: `${9 + (i % 4) * 2}rem` }} />
            <span className="skeleton ml-auto block h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
