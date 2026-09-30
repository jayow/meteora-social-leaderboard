"use client";

import { useEffect, useState } from "react";
import { useMe } from "@/components/MeProvider";
import { useRouter } from "next/navigation";

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
    memberNumber: number | null;
    joinedAt: string | null;
  }>;
}

export default function AdminPage() {
  const { loading, wallet } = useMe();
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
    if (!loading && !wallet) {
      router.push("/");
      return;
    }
    if (loading) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, wallet, router]);

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
      <main className="mx-auto max-w-[1200px] px-4 py-20">
        <p className="text-center text-mute">Loading...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1200px] px-4 py-20">
      <h1 className="mb-8 text-3xl font-bold">Admin</h1>

      <div className="glass mb-6 rounded-3xl p-6">
        <h2 className="mb-4 text-xl font-bold">Beta Status</h2>
        <p className="text-2xl font-bold">
          {data.memberCount} / {data.cap} members
        </p>
      </div>

      <div className="glass mb-6 rounded-3xl p-6">
        <h2 className="mb-4 text-xl font-bold">Generate Codes</h2>
        <div className="mb-4 flex gap-4">
          <input
            type="number"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            min={1}
            max={100}
            className="w-24 rounded-xl border border-white/10 bg-white/5 px-4 py-2"
          />
          <input
            type="number"
            value={maxUses}
            onChange={(e) => setMaxUses(Number(e.target.value))}
            min={1}
            max={1000}
            className="w-24 rounded-xl border border-white/10 bg-white/5 px-4 py-2"
          />
          <button onClick={generateCodes} disabled={generating} className="brand-grad rounded-full px-6 py-2 font-semibold">
            {generating ? "Generating..." : "Generate"}
          </button>
        </div>
      </div>

      <div className="glass mb-6 rounded-3xl p-6">
        <h2 className="mb-4 text-xl font-bold">Recent Joins</h2>
        <div className="space-y-2">
          {data.recentJoins.slice(0, 20).map((u) => (
            <div key={u.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
              <span className="font-semibold">
                #{u.memberNumber} {u.xHandle ? `@${u.xHandle}` : u.xName || `Anon LP #${u.id}`}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="glass rounded-3xl p-6">
        <h2 className="mb-4 text-xl font-bold">All Codes ({data.codes.length})</h2>
        <div className="space-y-2">
          {data.codes.map((code) => (
            <div key={code.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-3">
              <div>
                <span className="font-mono font-bold">{code.code}</span>
                <span className="ml-4 text-sm text-mute">
                  {code.uses}/{code.maxUses} · {code.createdByUserId ? `User ${code.createdByUserId}` : "Admin"}
                </span>
              </div>
              <button
                onClick={() => toggleCode(code.id, !code.disabled)}
                className={`rounded-full px-4 py-1 text-sm font-semibold ${
                  code.disabled ? "bg-white/5 text-mute" : "brand-grad"
                }`}
              >
                {code.disabled ? "Enable" : "Disable"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
