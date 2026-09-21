"use client";

import { useState } from "react";
import { linkX, unlinkX } from "@/lib/storage";

export function XConnect({ handle, avatarUrl, editable, onChange }: { handle?: string; avatarUrl?: string; editable: boolean; onChange?: () => void }) {
  const [input, setInput] = useState(handle || "");
  const [open, setOpen] = useState(false);

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
  if (!open) {
    return <button type="button" className="rounded-md bg-zinc-100 px-3 py-2 text-sm font-medium text-black" onClick={() => setOpen(true)}>Connect X</button>;
  }
  return (
    <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (!input.trim()) return; linkX(input); setOpen(false); onChange?.(); }}>
      <input className="rounded-md border border-zinc-700 bg-black px-3 py-2 text-sm outline-none focus:border-violet-500" placeholder="@handle" value={input} onChange={(e) => setInput(e.target.value)} />
      <button type="submit" className="rounded-md bg-violet-600 px-3 py-2 text-sm">Save</button>
      <button type="button" className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-400" onClick={() => setOpen(false)}>Cancel</button>
    </form>
  );
}
