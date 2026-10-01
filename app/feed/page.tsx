import type { Metadata } from "next";
import { ActivityFeed } from "@/components/ActivityFeed";

export const metadata: Metadata = {
  title: "Activity · Pool Party",
};

export default function FeedPage() {
  return <ActivityFeed />;
}
