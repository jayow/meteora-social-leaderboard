import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { findUser } from "@/lib/users";
import { listBadges } from "@/lib/badges/compute";
import { BADGES, isBadgeId, tierLabel } from "@/lib/badges/config";
import { displayName } from "@/lib/format";

const APP_URL = "https://lppool.party";

interface Props {
  params: Promise<{ user: string; badge: string }>;
}

/** The badge a member holds, or null (unknown badge, unknown member, or not earned). */
async function load(userParam: string, badgeParam: string) {
  if (!isBadgeId(badgeParam)) return null;
  const user = await findUser(decodeURIComponent(userParam));
  if (!user || !user.joinedAt) return null;
  const held = (await listBadges([user.id])).get(user.id)?.find((b) => b.id === badgeParam);
  return held ? { user, held } : null;
}

/** Link previews (X, Discord…) show the wide badge card. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { user: u, badge } = await params;
  const found = await load(u, badge);
  if (!found) return { title: "Pool Party", description: "Meteora LP leaderboard" };
  const handle = displayName(found.user);
  const tier = BADGES[found.held.id].tiered ? tierLabel(found.held.id, found.held.tier)?.split(" · ")[0] : null;
  const title = `${handle} earned ${tier ? `${tier} ` : ""}${BADGES[found.held.id].name} on Pool Party`;
  const slug = encodeURIComponent(found.user.xHandle || String(found.user.id));
  const image = `${APP_URL}/api/card/${slug}/badge/${found.held.id}?shape=wide`;
  return {
    title,
    description: "Badges are earned from Meteora LP stats on Pool Party.",
    openGraph: { title, images: [{ url: image, width: 1200, height: 630, alt: title }], type: "website" },
    twitter: { card: "summary_large_image", title, images: [image] },
  };
}

/** Where a shared badge link lands: the square card, then the member's profile or all badges. */
export default async function SharedBadgePage({ params }: Props) {
  const { user: u, badge } = await params;
  const found = await load(u, badge);
  if (!found) notFound();
  const slug = encodeURIComponent(found.user.xHandle || String(found.user.id));
  const handle = displayName(found.user);
  return (
    <main className="mx-auto flex max-w-[560px] flex-col items-center px-4 pb-10 pt-8">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/card/${slug}/badge/${found.held.id}`} alt={`${handle}'s ${BADGES[found.held.id].name} badge`} width={1080} height={1080} className="w-full rounded-tile" />
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link href={`/profile/${slug}`} className="btn-secondary">
          See {handle}&apos;s profile
        </Link>
        <Link href="/badges" className="btn-ghost">
          All badges
        </Link>
      </div>
    </main>
  );
}
