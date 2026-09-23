"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { linkX, unlinkX } from "@/lib/storage";

export function XConnect({ handle, avatarUrl, editable, onChange }: { handle?: string; avatarUrl?: string; editable: boolean; onChange?: () => void }) {
  const searchParams = useSearchParams();
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    const xStatus = searchParams.get("x");
    if (xStatus === "connected" && !handle) {
      setConnecting(true);
      fetch("/api/x/session")
        .then((res) => res.json())
        .then((data) => {
          if (data.profile) {
            linkX(data.profile.username, data.profile.avatarUrl, data.profile.name);
            onChange?.();
          }
        })
        .catch(console.error)
        .finally(() => setConnecting(false));
    }
  }, [searchParams, handle, onChange]);

  if (handle) {
    return (
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${handle}`} alt={handle} className="h-10 w-10 rounded-full border border-zinc-700" />
        <div>
          <a className="text-sm font-medium text-sky-400 hover:underline" href={`https://x.com/${handle}`} target="_blank" rel="noreferrer">@{handle}</a>
          {editable && (
            <button type="button" className="ml-3 text-xs text-zinc-500 hover:text-zinc-300" onClick={() => { unlinkX(); onChange?.(); }}>Disconnect</button>
          )}
        </div>
      </div>
    );
  }

  if (!editable) return <p className="text-sm text-zinc-500">X not connected</p>;

  if (connecting) {
    return <p className="text-sm text-zinc-500">Connecting...</p>;
  }

  return (
    <button 
      type="button" 
      className="rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 transition-colors"
      onClick={() => { window.location.href = "/api/x/login"; }}
    >
      Sign in with X
    </button>
  );
}
