import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { isAdminUser } from "@/lib/invite";
import { MetricsDashboard } from "@/components/admin/MetricsDashboard";

export const dynamic = "force-dynamic";

// Never indexed; not linked from anywhere in the app.
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Admin metrics "data center". Checked on the server before anything is rendered: anyone who isn't
 * an admin gets the ordinary 404, so the page is indistinguishable from one that doesn't exist.
 */
export default async function AdminMetricsPage() {
  if (!isAdminUser(await getSessionUser())) notFound();
  return <MetricsDashboard />;
}
