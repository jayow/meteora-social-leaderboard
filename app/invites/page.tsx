"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMe } from "@/components/MeProvider";
import { useRouter } from "next/navigation";

interface InviteCode {
  id: number;
  code: string;
  uses: number;
  maxUses: number;
  createdAt: string;
}

export default function InvitesPage() {
  // Decide from the session (not the profile, which loads later): on a direct load or refresh the session
  // hasn't answered yet on the first render, and treating that as "signed out" bounced members away.
  const { sessionChecked, userId } = useMe();
  const router = useRouter();
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "not-member" | "error">("loading");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionChecked) return;
    if (!userId) {
      router.replace("/");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    fetch("/api/invites", { cache: "no-store" })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 401) {
          setStatus("not-member");
          return;
        }
        if (!res.ok) throw new Error(`invites ${res.status}`);
        const data = (await res.json()) as { codes: InviteCode[] };
        if (cancelled) return;
        setCodes(data.codes);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [sessionChecked, userId, router]);

  const copyLink = (code: string) => {
    const link = `${window.location.origin}/join?code=${code}`;
    navigator.clipboard.writeText(link);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  if (!sessionChecked || !userId || status === "loading") {
    return (
      <main className="mx-auto max-w-[800px] px-4 py-20">
        <p className="text-center text-mute">Loading…</p>
      </main>
    );
  }

  if (status !== "ready") {
    return (
      <main className="mx-auto max-w-[800px] px-4 py-20 text-center">
        <h1 className="mb-3 text-3xl font-bold">Your Invites</h1>
        {status === "not-member" ? (
          <p className="text-mute">
            Invites are for beta members.{" "}
            <Link href="/join" className="font-semibold text-orange hover:text-orange-soft">
              Join the beta →
            </Link>
          </p>
        ) : (
          <p className="text-mute">Couldn&apos;t load your invites. Try refreshing.</p>
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[800px] px-4 py-20">
      <h1 className="mb-8 text-3xl font-bold">Your Invites</h1>
      <div className="glass rounded-3xl p-6">
        <p className="mb-4 text-sm text-mute">You have {codes.filter((c) => c.uses < c.maxUses).length} invites remaining</p>
        <div className="space-y-3">
          {codes.map((code) => (
            <div key={code.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4">
              <div>
                <p className="font-mono text-lg font-bold">{code.code}</p>
                <p className="text-sm text-mute">
                  {code.uses} / {code.maxUses} used
                </p>
              </div>
              <button
                onClick={() => copyLink(code.code)}
                disabled={code.uses >= code.maxUses}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  code.uses >= code.maxUses
                    ? "cursor-not-allowed bg-white/5 text-mute"
                    : "brand-grad text-white"
                }`}
              >
                {copiedCode === code.code ? "Copied!" : "Copy Link"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
