import type { Metadata } from "next";
import type { ReactNode } from "react";
import { findUser } from "@/lib/users";
import { displayName } from "@/lib/format";

const APP_URL = "https://web-production-c8f29.up.railway.app";

interface Props {
  params: Promise<{ id: string }>;
  children: ReactNode;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);

  const user = await findUser(decodedId);
  
  if (!user || !user.joinedAt) {
    return {
      title: "Pool Party",
      description: "Meteora LP leaderboard",
    };
  }

  const handle = displayName(user);
  const title = `${handle} on Pool Party`;
  const description = `Check out ${handle}'s Meteora LP performance on Pool Party`;
  const ogImage = `${APP_URL}/api/card/${user.xHandle || user.id}?range=30d`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: `${handle}'s PnL Card`,
        },
      ],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default function ProfileLayout({ children }: Props) {
  return <>{children}</>;
}
