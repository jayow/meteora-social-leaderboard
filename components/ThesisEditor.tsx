"use client";

import { useState } from "react";
import { setThesis } from "@/lib/storage";

export function ThesisEditor({ initial, editable, onSaved }: { initial: string; editable: boolean; onSaved?: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-zinc-300">Trading Thesis</h3>
        {editable && !editing && (
          <button type="button" className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium hover:bg-violet-500" onClick={() => setEditing(true)}>Edit</button>
        )}
        {editable && editing && (
          <div className="flex gap-2">
            <button type="button" className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs" onClick={() => { setValue(initial); setEditing(false); }}>Cancel</button>
            <button type="button" className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium hover:bg-violet-500" onClick={() => { setThesis(value); onSaved?.(value); setEditing(false); }}>Save</button>
          </div>
        )}
      </div>
      {editing ? (
        <textarea className="mt-3 w-full rounded-lg border border-zinc-700 bg-black p-3 text-sm outline-none focus:border-violet-500" rows={5} value={value} onChange={(e) => setValue(e.target.value)} />
      ) : (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">{value || "Write your trading thesis here..."}</p>
      )}
    </div>
  );
}
