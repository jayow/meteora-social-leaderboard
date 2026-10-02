"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/EmptyState";
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

  const copyLink = async (code: string) => {
    const link = `${window.location.origin}/join?code=${code}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      return; // "Copied" only when it really was
    }
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  if (!sessionChecked || !userId || status === "loading") {
    return (
      <main className="mx-auto max-w-[640px] px-4 pb-16 pt-6">
        <span className="skeleton block h-8 w-40" />
        <span className="skeleton mt-2 block h-4 w-56" />
        <div className="card mt-6 space-y-2 p-5" aria-busy="true" aria-label="Loading invites">
          {[0, 1, 2].map((i) => (
            <div key={i} className="tile flex h-[66px] items-center justify-between px-4">
              <div className="space-y-1.5">
                <span className="skeleton block h-4 w-28" />
                <span className="skeleton block h-3 w-16" />
              </div>
              <span className="skeleton h-8 w-24 rounded-full" />
            </div>
          ))}
        </div>
      </main>
    );
  }

  if (status !== "ready") {
    return (
      <main className="mx-auto max-w-[640px] px-4 pb-16 pt-6">
        <EmptyState
          title="Your invites"
          action={
            status === "not-member" ? (
              <Link href="/join" className="btn-primary">
                Join the beta
              </Link>
            ) : undefined
          }
        >
          {status === "not-member" ? "Invites are for beta members." : "Couldn't load your invites. Try refreshing."}
        </EmptyState>
      </main>
    );
  }

  const remaining = codes.filter((c) => c.uses < c.maxUses).length;

  return (
    <main className="mx-auto max-w-[640px] px-4 pb-16 pt-6">
      <PageHeader title="Your invites" description={`You have ${remaining} invite${remaining === 1 ? "" : "s"} remaining.`} />
      <div className="card mt-6 p-5">
        {codes.length === 0 ? (
          <p className="py-6 text-center text-base text-mute">No invite codes yet.</p>
        ) : (
          <div className="space-y-2">
            {/* Unused codes first; a used code is just a quiet row with a "Used" chip. */}
            {[...codes].sort((a, b) => Number(a.uses >= a.maxUses) - Number(b.uses >= b.maxUses)).map((code) => {
              const usedUp = code.uses >= code.maxUses;
              return (
                <div key={code.id} className="tile flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className={`num truncate text-md font-semibold ${usedUp ? "text-mute" : "text-fg"}`}>{code.code}</p>
                    {code.maxUses > 1 && (
                      <p className="num mt-0.5 text-sm text-mute">
                        {code.uses} / {code.maxUses} used
                      </p>
                    )}
                  </div>
                  {usedUp ? (
                    <span className="chip shrink-0">Used</span>
                  ) : (
                    <button type="button" onClick={() => void copyLink(code.code)} className="btn-secondary h-8 shrink-0 px-3">
                      {copiedCode === code.code ? "Copied" : "Copy link"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
