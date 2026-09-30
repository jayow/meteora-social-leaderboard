"use client";

import { useEffect, useState } from "react";
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
  const { loading, user } = useMe();
  const router = useRouter();
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [loadingCodes, setLoadingCodes] = useState(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/");
      return;
    }
    if (loading || !user) return;
    
    fetch("/api/invites")
      .then((res) => res.json())
      .then((data: { codes: InviteCode[] }) => {
        setCodes(data.codes);
        setLoadingCodes(false);
      })
      .catch(() => setLoadingCodes(false));
  }, [loading, user, router]);

  const copyLink = (code: string) => {
    const link = `${window.location.origin}/join?code=${code}`;
    navigator.clipboard.writeText(link);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  if (loading || loadingCodes) {
    return (
      <main className="mx-auto max-w-[800px] px-4 py-20">
        <p className="text-center text-mute">Loading...</p>
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
