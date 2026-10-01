/**
 * Gold / silver / bronze mark for leaderboard ranks 1-3 (inline SVG, flat metal tones, no gradients).
 * Tokens live in app/globals.css (`gold`, `silver`, `bronze`); see THEME.md "Medals".
 */
export type MedalRank = 1 | 2 | 3;

export const isMedalRank = (rank: number | null | undefined): rank is MedalRank => rank === 1 || rank === 2 || rank === 3;

/** Literal class names per metal (kept static so Tailwind can see them). */
export const MEDAL = {
  1: { label: "Gold", text: "text-gold", ring: "border-gold", card: "border-gold/50 bg-gold/[.07] hover:border-gold" },
  2: { label: "Silver", text: "text-silver", ring: "border-silver", card: "border-silver/50 bg-silver/[.07] hover:border-silver" },
  3: { label: "Bronze", text: "text-bronze", ring: "border-bronze", card: "border-bronze/50 bg-bronze/[.07] hover:border-bronze" },
} as const satisfies Record<MedalRank, { label: string; text: string; ring: string; card: string }>;

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
      <text x="12" y="22.2" textAnchor="middle" fontSize="10.5" fontWeight="800" fill="var(--color-bg)" fontFamily="inherit">
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
export const PODIUM_GRID: Record<number, string> = { 1: "sm:max-w-[340px]", 2: "sm:max-w-[660px] sm:grid-cols-2", 3: "sm:max-w-[980px] sm:grid-cols-3" };

/** Loading state matching the podium + two-column rows. */
export function PodiumSkeleton({
  testId = "board-skeleton",
  heights = { first: "h-[92px] sm:h-[328px]", other: "h-[78px] sm:h-[280px]" },
}: {
  testId?: string;
  /** Card heights (phone + `sm`) so the skeleton matches the real podium. */
  heights?: { first: string; other: string };
}) {
  return (
    <div aria-hidden data-testid={testId}>
      <div className={`mx-auto mt-6 grid gap-2.5 sm:items-end sm:gap-4 ${PODIUM_GRID[3]}`}>
        {([2, 1, 3] as const).map((r) => (
          <div
            key={r}
            className={`animate-pulse rounded-2xl border ${MEDAL[r].card} ${PODIUM_STACK_ORDER[r]} ${r === 1 ? heights.first : heights.other}`}
          />
        ))}
      </div>
      <div className="mt-6 grid gap-2 lg:grid-cols-2 lg:gap-x-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-[58px] animate-pulse rounded-xl border border-border bg-surface" />
        ))}
      </div>
    </div>
  );
}
