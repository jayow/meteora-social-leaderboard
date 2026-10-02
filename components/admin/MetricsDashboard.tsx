"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AdminStats, DailyStatsRow } from "@/lib/stats";
import type { EventsReport, UserMetrics } from "@/lib/metrics";
import { fmtUsd, timeAgo } from "@/lib/format";

/**
 * Admin "data center": every metric on one dense, auto-refreshing screen. Data comes from the
 * admin-only APIs (/api/admin/stats|events|users). Theme tokens only: neutral ink for data, `up` /
 * `dn` only for good / failing status (always with a text label), no accent decoration.
 */

type StatsResponse = AdminStats & { history?: DailyStatsRow[]; generatedAt: string };
const RANGES = [7, 30, 90] as const;
const REFRESH_MS = 60_000;
const NUM = "num tabular-nums";

/** Last `days` UTC dates, oldest first, so missing days show as zero instead of disappearing. */
function dateRange(days: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

const shortDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const fmtInt = (n: number) => n.toLocaleString("en-US");

/* ------------------------------------------------------------------------------------------------ */
/* Building blocks                                                                                   */
/* ------------------------------------------------------------------------------------------------ */

function Panel({ title, note, children, className = "" }: { title: string; note?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`card min-w-0 p-4 ${className}`}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-fg">{title}</h2>
        {note && <span className="text-sm text-mute">{note}</span>}
      </div>
      {children}
    </section>
  );
}

/** Tiny single-series trend line (no axes): context for a stat tile, not a chart to read values off. */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${28 - (v / max) * 26}`).join(" ");
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="mt-2 h-7 w-full" aria-hidden="true">
      <polyline points={pts} fill="none" stroke="var(--color-fg-secondary)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

function Kpi({ label, value, sub, trend }: { label: string; value: string; sub?: string; trend?: number[] }) {
  return (
    <div className="tile min-w-0 p-3">
      <div className="truncate text-sm text-mute">{label}</div>
      <div className={`${NUM} mt-1 text-xl font-semibold text-fg`}>{value}</div>
      {sub && <div className="truncate text-sm text-mute">{sub}</div>}
      {trend && <Sparkline values={trend} />}
    </div>
  );
}

/** Daily columns with a hover tooltip; one series, neutral ink, latest day labelled. */
function Columns({ label, data }: { label: string; data: { date: string; value: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.value), 1);
  const last = data[data.length - 1];
  const shown = hover != null ? data[hover] : last;
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-sm text-mute">{label}</span>
        <span className="text-sm text-mute">
          {shown ? (
            <>
              <span className={`${NUM} text-fg`}>{fmtInt(shown.value)}</span> on {shortDate(shown.date)}
            </>
          ) : null}
        </span>
      </div>
      <div
        className="relative flex h-32 items-end gap-[2px] border-b border-border pt-5"
        role="img"
        aria-label={`${label}: ${fmtInt(total)} over ${data.length} days, latest ${last ? fmtInt(last.value) : 0}, peak ${fmtInt(max)}`}
        onMouseLeave={() => setHover(null)}
      >
        <span className={`${NUM} pointer-events-none absolute left-0 top-0 text-xs text-mute`}>{fmtInt(max)}</span>
        {data.map((d, i) => (
          <div key={d.date} className="flex h-full min-w-0 flex-1 items-end" onMouseEnter={() => setHover(i)}>
            <div
              className={`w-full rounded-t-[4px] ${hover === i ? "bg-fg" : i === data.length - 1 ? "bg-fg-secondary" : "bg-fg-secondary/45"}`}
              style={{ height: d.value > 0 ? `${Math.max((d.value / max) * 100, 2)}%` : "1px" }}
            />
          </div>
        ))}
      </div>
      <div className={`${NUM} mt-1 flex justify-between text-xs text-mute`} aria-hidden="true">
        <span>{data[0] ? shortDate(data[0].date) : ""}</span>
        <span>{last ? shortDate(last.date) : ""}</span>
      </div>
    </div>
  );
}

/** Ranked list with an inline magnitude bar (tables beat charts past ~7 rows). */
function BarList({ rows, empty }: { rows: { key: string; label: ReactNode; value: number; extra?: string }[]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-mute">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-1">
      {rows.map((r) => (
        <li key={r.key} className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-tile px-2 py-1 text-sm">
          <div className="absolute inset-y-0 left-0 rounded-tile bg-fg-secondary/10" style={{ width: `${(r.value / max) * 100}%` }} aria-hidden="true" />
          <span className="relative truncate text-fg-secondary">{r.label}</span>
          <span className={`${NUM} relative text-fg`}>
            {fmtInt(r.value)}
            {r.extra && <span className="ml-2 text-mute">{r.extra}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Status({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="tile flex items-start gap-2.5 p-3">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${ok ? "bg-up" : "bg-dn"}`} aria-hidden="true" />
      <div className="min-w-0">
        <div className="text-sm text-fg">
          {label} <span className="text-mute">· {ok ? "OK" : "Needs attention"}</span>
        </div>
        <div className={`${NUM} truncate text-sm text-mute`}>{detail}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ */
/* Users table                                                                                       */
/* ------------------------------------------------------------------------------------------------ */

type SortKey = "memberNumber" | "joinedAt" | "lastSeenAt" | "events7d" | "lpIdeas" | "followers" | "openValueUsd" | "invitesUsed";
const USER_COLS: { key: SortKey; label: string }[] = [
  { key: "memberNumber", label: "#" },
  { key: "joinedAt", label: "Joined" },
  { key: "lastSeenAt", label: "Last seen" },
  { key: "events7d", label: "Actions 7D" },
  { key: "lpIdeas", label: "LP ideas" },
  { key: "followers", label: "Followers" },
  { key: "invitesUsed", label: "Invites used" },
  { key: "openValueUsd", label: "Open value" },
];

function UsersTable({ users }: { users: UserMetrics[] }) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "lastSeenAt", desc: true });
  const rows = useMemo(() => {
    const val = (u: UserMetrics) => {
      const v = u[sort.key];
      return typeof v === "string" ? Date.parse(v) : v ?? -Infinity;
    };
    return [...users].sort((a, b) => (sort.desc ? val(b) - val(a) : val(a) - val(b)));
  }, [users, sort]);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-mute">
            <th className="py-2 pr-3 font-medium">Account</th>
            {USER_COLS.map((c) => (
              <th key={c.key} className="py-2 pr-3 text-right font-medium" aria-sort={sort.key === c.key ? (sort.desc ? "descending" : "ascending") : "none"}>
                <button
                  type="button"
                  className={`hover:text-fg ${sort.key === c.key ? "text-fg" : ""}`}
                  onClick={() => setSort((s) => ({ key: c.key, desc: s.key === c.key ? !s.desc : true }))}
                >
                  {c.label}
                  {sort.key === c.key ? (sort.desc ? " ↓" : " ↑") : ""}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id} className="border-b border-border/60">
              <td className="py-2 pr-3">
                <div className="truncate text-fg">{u.name}</div>
                <div className="truncate text-mute">
                  {u.joinedAt ? "Member" : "Not joined"} · {u.signupMethod ?? "wallet"}
                  {u.hasX ? " · X" : ""}
                  {u.invitedByName ? ` · invited by ${u.invitedByName}` : ""}
                </div>
              </td>
              <td className={`${NUM} py-2 pr-3 text-right`}>{u.memberNumber ?? "–"}</td>
              <td className={`${NUM} py-2 pr-3 text-right text-fg-secondary`}>{u.joinedAt ? shortDate(u.joinedAt.slice(0, 10)) : "–"}</td>
              <td className={`${NUM} py-2 pr-3 text-right text-fg-secondary`}>{u.lastSeenAt ? timeAgo(u.lastSeenAt) : "–"}</td>
              <td className={`${NUM} py-2 pr-3 text-right`}>{fmtInt(u.events7d)}</td>
              <td className={`${NUM} py-2 pr-3 text-right`}>{fmtInt(u.lpIdeas)}</td>
              <td className={`${NUM} py-2 pr-3 text-right`}>{fmtInt(u.followers)}</td>
              <td className={`${NUM} py-2 pr-3 text-right`}>
                {u.invitesUsed}/{u.invitesCreated}
              </td>
              <td className={`${NUM} py-2 pr-3 text-right`}>{fmtUsd(u.openValueUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ */
/* Dashboard                                                                                         */
/* ------------------------------------------------------------------------------------------------ */

export function MetricsDashboard() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [events, setEvents] = useState<EventsReport | null>(null);
  const [users, setUsers] = useState<UserMetrics[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const get = async <T,>(url: string) => {
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) throw new Error(`${url} ${r.status}`);
        return (await r.json()) as T;
      };
      const [s, e, u] = await Promise.all([
        get<StatsResponse>(`/api/admin/stats?days=${days}`),
        get<EventsReport>(`/api/admin/events?days=${days}`),
        get<{ users: UserMetrics[] }>("/api/admin/users"),
      ]);
      setStats(s);
      setEvents(e);
      setUsers(u.users);
      setError(null);
      setLoadedAt(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load metrics");
    }
  }, [days]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const dates = useMemo(() => dateRange(days), [days]);
  const series = useMemo(() => {
    const ev = new Map((events?.daily ?? []).map((d) => [d.date, d]));
    const hist = new Map((stats?.history ?? []).map((h) => [h.date, h]));
    const pick = (f: (date: string) => number) => dates.map((date) => ({ date, value: f(date) }));
    return {
      activeUsers: pick((d) => ev.get(d)?.activeUsers ?? 0),
      visitors: pick((d) => ev.get(d)?.visitors ?? 0),
      pageViews: pick((d) => ev.get(d)?.counts.page_view ?? 0),
      actions: pick((d) => {
        const c = ev.get(d)?.counts ?? {};
        return Object.entries(c).reduce((s, [k, v]) => (k === "page_view" || k === "click" ? s : s + v), 0);
      }),
      // Today's row is still being written: use the live number for the last point.
      members: pick((d) => (d === dates[dates.length - 1] && stats ? stats.growth.members : hist.get(d)?.stats.growth.members ?? 0)),
      syncFailed: pick((d) => hist.get(d)?.sync.failed ?? 0),
    };
  }, [dates, events, stats]);

  if (!stats || !events || !users) {
    return (
      <main className="mx-auto max-w-[1440px] px-4 py-8 lg:px-6">
        <p className="text-base text-mute">{error ? `Couldn't load metrics: ${error}` : "Loading metrics…"}</p>
      </main>
    );
  }

  const { growth: g, engagement: e, health: h } = stats;
  const today = events.daily.find((d) => d.date === dates[dates.length - 1]);
  const todayActions = series.actions[series.actions.length - 1]?.value ?? 0;
  const f = events.funnel;
  const actionTotals = events.totals.filter((t) => t.name !== "page_view" && t.name !== "click");

  return (
    <main className="mx-auto max-w-[1440px] px-4 pb-16 pt-6 lg:px-6" data-testid="metrics-dashboard">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Data center</h1>
          <p className="text-sm text-mute">
            Admin only · refreshes every minute{loadedAt ? ` · updated ${timeAgo(loadedAt)}` : ""}
            {error ? ` · last refresh failed (${error})` : ""}
          </p>
        </div>
        <div className="flex gap-1" role="group" aria-label="Range">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setDays(r)}
              aria-pressed={days === r}
              className={days === r ? "btn-secondary h-8 px-3 text-fg" : "btn-ghost h-8 px-3"}
            >
              {r}D
            </button>
          ))}
        </div>
      </div>

      {/* Headline numbers */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Members" value={fmtInt(g.members)} sub={`of ${fmtInt(g.cap)} · +${g.joined7d} in 7D`} trend={series.members.map((d) => d.value)} />
        <Kpi label="Active today" value={fmtInt(today?.activeUsers ?? 0)} sub={`${e.active7d} active in 7D`} trend={series.activeUsers.map((d) => d.value)} />
        <Kpi label="Visitors today" value={fmtInt(today?.visitors ?? 0)} sub="incl. signed out" trend={series.visitors.map((d) => d.value)} />
        <Kpi label="Actions today" value={fmtInt(todayActions)} sub="excl. views & clicks" trend={series.actions.map((d) => d.value)} />
        <Kpi label="LP ideas" value={fmtInt(e.lpIdeas)} sub={`+${e.lpIdeas7d} in 7D · ${e.likes} likes`} />
        <Kpi label="Value tracked" value={fmtUsd(h.openValueUsd)} sub={`${h.openPositions} positions · ${h.openPools} pools`} />
      </div>

      {/* Trends */}
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Activity" note={`last ${days} days, UTC`}>
          <div className="grid gap-5 sm:grid-cols-2">
            <Columns label="Active members per day" data={series.activeUsers} />
            <Columns label="Visitors per day" data={series.visitors} />
          </div>
        </Panel>
        <Panel title="Usage" note={`last ${days} days, UTC`}>
          <div className="grid gap-5 sm:grid-cols-2">
            <Columns label="Page views per day" data={series.pageViews} />
            <Columns label="Actions per day" data={series.actions} />
          </div>
        </Panel>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Panel title="Signup funnel" note={`last ${days} days`}>
          <BarList
            empty="No visitors yet."
            rows={[
              { key: "v", label: "Visitors", value: f.visitors },
              { key: "s", label: "Signed in", value: f.signedIn, extra: `${f.newAccounts} new` },
              { key: "i", label: "Checked an invite code", value: f.inviteChecks },
              { key: "j", label: "Joined", value: f.joined },
            ]}
          />
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Kpi label="Waiting on an invite" value={fmtInt(g.waiting)} />
            <Kpi label="Invites used" value={`${g.invitesUsed} / ${g.invitesCreated}`} sub={`${g.invitesAvailable} uses left`} />
          </div>
        </Panel>
        <Panel title="Sync health" note={h.lastSyncAt ? `last sync ${timeAgo(h.lastSyncAt)}` : "no sync yet"}>
          <div className="space-y-2">
            <Status ok={h.syncedRecently === g.members} label="Fresh data" detail={`${h.syncedRecently} of ${g.members} members synced in the last 30 min`} />
            <Status ok={h.stale === 0} label="Stale members" detail={`${h.stale} not synced for over 2 hours`} />
            <Status ok={h.failing === 0} label="Failing syncs" detail={`${h.failing} members whose last sync failed`} />
            <Status
              ok={h.positionDetails === 0 || h.positionsWithShape === h.positionDetails}
              label="Liquidity shapes"
              detail={`${h.positionsWithShape} of ${h.positionDetails} positions have a shape`}
            />
          </div>
          <div className="mt-4">
            <Columns label="Failed member syncs per day" data={series.syncFailed} />
          </div>
        </Panel>
        <Panel title="Every action" note={`last ${days} days · users`}>
          <BarList
            empty="No actions recorded yet."
            rows={actionTotals.map((t) => ({ key: t.name, label: t.name.replace(/_/g, " "), value: t.count, extra: `${t.users}` }))}
          />
        </Panel>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Panel title="Top pages" note="views · users">
          <BarList empty="No page views yet." rows={events.topPages.slice(0, 15).map((p) => ({ key: p.path, label: p.path, value: p.views, extra: `${p.users}` }))} />
        </Panel>
        <Panel title="Top clicks" note="label · page">
          <BarList
            empty="No clicks yet."
            rows={events.topClicks.slice(0, 15).map((c) => ({
              key: `${c.label}|${c.path}`,
              label: (
                <>
                  {c.label || "(no label)"} <span className="text-mute">{c.path}</span>
                </>
              ),
              value: c.count,
            }))}
          />
        </Panel>
        <Panel title="Outbound" note="where people leave to">
          <BarList
            empty="No outbound clicks yet."
            rows={events.outbound.slice(0, 15).map((o) => ({
              key: `${o.host}|${o.to}`,
              label: (
                <>
                  {o.host} <span className="text-mute">{o.to}</span>
                </>
              ),
              value: o.count,
            }))}
          />
        </Panel>
      </div>

      <Panel title="Users" note={`${users.length} accounts · click a column to sort`}>
        <UsersTable users={users} />
      </Panel>
    </main>
  );
}
