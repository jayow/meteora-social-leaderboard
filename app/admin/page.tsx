"use client";

import { useEffect, useState } from "react";
import { useMe } from "@/components/MeProvider";
import { useRouter } from "next/navigation";
import { displayName } from "@/lib/format";
import { AnnouncementsAdmin } from "@/components/admin/Announcements";

interface AdminData {
  memberCount: number;
  cap: number;
  codes: Array<{
    id: number;
    code: string;
    createdByUserId: number | null;
    uses: number;
    maxUses: number;
    disabled: number;
    createdAt: string;
  }>;
  recentJoins: Array<{
    id: number;
    xHandle: string | null;
    xName: string | null;
    anonName: string | null;
    memberNumber: number | null;
    joinedAt: string | null;
  }>;
}

export default function AdminPage() {
  // Signed-in user, not a connected wallet: wallets disconnect right after sign-in.
  const { loading, userId, sessionChecked } = useMe();
  const router = useRouter();
  const [data, setData] = useState<AdminData | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [count, setCount] = useState(5);
  const [maxUses, setMaxUses] = useState(1);

  const loadData = () => {
    fetch("/api/admin")
      .then((res) => res.json())
      .then((d: AdminData) => {
        setData(d);
        setLoadingData(false);
      })
      .catch(() => {
        router.push("/");
      });
  };

  useEffect(() => {
    if (!sessionChecked || loading) return;
    if (!userId) {
      router.push("/");
      return;
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, userId, sessionChecked, router]);

  const generateCodes = async () => {
    setGenerating(true);
    try {
      await fetch("/api/admin/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count, maxUses }),
      });
      loadData();
    } catch {
      alert("Failed to generate codes");
    } finally {
      setGenerating(false);
    }
  };

  const toggleCode = async (codeId: number, disabled: boolean) => {
    try {
      await fetch("/api/admin/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codeId, disabled }),
      });
      loadData();
    } catch {
      alert("Failed to toggle code");
    }
  };

  if (loading || loadingData || !data) {
    return (
      <main className="mx-auto max-w-[1320px] px-4 pb-16 pt-6 lg:px-6">
        <p className="text-base text-mute">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1320px] px-4 pb-16 pt-6 lg:px-6">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Admin</h1>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">Beta status</h2>
        <p className="num text-xl font-semibold">
          {data.memberCount} / {data.cap} members
        </p>
      </section>

      <AnnouncementsAdmin />

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">Generate codes</h2>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-sm text-mute">Codes</span>
            <input
              type="number"
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              min={1}
              max={100}
              className="field num h-9 w-24"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-mute">Uses each</span>
            <input
              type="number"
              value={maxUses}
              onChange={(e) => setMaxUses(Number(e.target.value))}
              min={1}
              max={1000}
              className="field num h-9 w-24"
            />
          </label>
          <button onClick={generateCodes} disabled={generating} className="btn-primary">
            {generating ? "Generating…" : "Generate"}
          </button>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">Recent joins</h2>
        <div className="divide-y divide-border">
          {data.recentJoins.slice(0, 20).map((u) => (
            <div key={u.id} className="py-2.5 text-base">
              <span className="num text-mute">#{u.memberNumber}</span> <span className="font-semibold">{displayName(u)}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          All codes <span className="num font-medium text-mute">{data.codes.length}</span>
        </h2>
        <div className="divide-y divide-border border-y border-border">
          {data.codes.map((code) => (
            <div key={code.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex min-w-0 items-center">
                <span className={`num font-semibold ${code.disabled ? "text-mute" : ""}`}>{code.code}</span>
                {code.disabled ? <span className="chip ml-2">Disabled</span> : null}
                <span className="num ml-3 text-base text-mute">
                  {code.uses}/{code.maxUses} · {code.createdByUserId ? `User ${code.createdByUserId}` : "Admin"}
                </span>
              </div>
              <button
                onClick={() => toggleCode(code.id, !code.disabled)}
                className="btn-secondary h-8 px-3"
              >
                {code.disabled ? "Enable" : "Disable"}
              </button>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
