import { meteoraPoolUrl } from "@/lib/meteora-links";

/** The one quiet outbound "Dip in" link per pool (Meteora, with the referral code). */
export function DipLink({ poolAddress, protocol, className = "" }: { poolAddress: string; protocol?: string | null; className?: string }) {
  return (
    <a
      href={meteoraPoolUrl(poolAddress, protocol)}
      target="_blank"
      rel="noopener noreferrer"
      className={`relative z-10 shrink-0 whitespace-nowrap text-[12px] font-semibold text-mute transition hover:text-fg ${className}`}
    >
      Dip in ↗
    </a>
  );
}
