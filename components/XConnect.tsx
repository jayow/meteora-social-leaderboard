"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { linkX, unlinkX } from "@/lib/storage";

export function XConnect({ handle, editable, onChange, placeholderUsername }: { handle?: string; editable: boolean; onChange?: () => void; placeholderUsername?: string }) {
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
        .finally(() => {
          setConnecting(false);
          window.history.replaceState(null, "", window.location.pathname);
        });
    }
  }, [searchParams, handle, onChange]);

  if (handle) {
    return (
      <div className="flex items-center gap-2">
        <a className="text-sm font-medium text-sky-400 hover:underline" href={`https://x.com/${handle}`} target="_blank" rel="noreferrer">@{handle}</a>
        {editable && (
          <button type="button" className="text-xs text-zinc-500 hover:text-zinc-300" onClick={() => { unlinkX(); onChange?.(); }}>Disconnect</button>
        )}
      </div>
    );
  }

  if (!editable) {
    return <p className="text-sm text-zinc-500">{placeholderUsername ? `@${placeholderUsername}` : "X not connected"}</p>;
  }

  if (connecting) {
    return <p className="text-sm text-zinc-500">Connecting...</p>;
  }

  return (
    <div className="flex items-center gap-3">
      {placeholderUsername && <p className="text-sm text-zinc-500">@{placeholderUsername}</p>}
      <button 
        type="button" 
        className="rounded-md bg-sky-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-600 transition-colors"
        onClick={() => { window.location.href = "/api/x/login"; }}
      >
        Connect X
      </button>
    </div>
  );
}
