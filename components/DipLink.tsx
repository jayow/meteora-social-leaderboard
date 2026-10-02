import { meteoraPoolUrl } from "@/lib/meteora-links";

/** The one quiet outbound "Dip in" link per pool (Meteora, with the referral code). */
export function DipLink({ poolAddress, protocol, className = "" }: { poolAddress: string; protocol?: string | null; className?: string }) {
  return (
    <a
      href={meteoraPoolUrl(poolAddress, protocol)}
      target="_blank"
      rel="noopener noreferrer"
      className={`relative z-10 shrink-0 whitespace-nowrap rounded-tag text-sm font-semibold text-accent transition hover:text-accent-hover ${className}`}
    >
      Dip in ↗
    </a>
  );
}
