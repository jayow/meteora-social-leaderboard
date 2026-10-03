"use client";

import { useCallback, useEffect, useState } from "react";
import { timeAgo } from "@/lib/format";
import type { Announcement } from "@/lib/notifications";

const MAX = 280;

/** Admin: post an announcement to every member (bell + dismissible banner), and remove old ones. */
export function AnnouncementsAdmin() {
  const [list, setList] = useState<Announcement[]>([]);
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/announcements", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ announcements: Announcement[] }>) : null))
      .then((d) => d && setList(d.announcements))
      .catch(() => undefined);
  }, []);

  useEffect(load, [load]);

  const post = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, link }),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) {
        setError(j.error || "Couldn't post it. Try again.");
        return;
      }
      setBody("");
      setLink("");
      load();
    } catch {
      setError("Couldn't post it. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    await fetch(`/api/admin/announcements?id=${id}`, { method: "DELETE" }).catch(() => undefined);
    load();
  };

  return (
    <section className="mb-10">
      <h2 className="mb-1 text-lg font-semibold">Announcements</h2>
      <p className="mb-3 text-base text-mute">Goes to every member: in the notification bell, and as a banner under the header until they close it.</p>
      <div className="grid max-w-xl gap-2">
        <label className="block">
          <span className="mb-1 flex justify-between text-sm text-mute">
            <span>Message</span>
            <span className="num">
              {body.length}/{MAX}
            </span>
          </span>
          <textarea
            id="announcement-body"
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, MAX))}
            rows={3}
            className="field h-auto w-full resize-none py-2"
            placeholder="Badges just got a redesign. Check your new tiers."
            data-testid="announcement-body"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-mute">Link (optional): a page like /badges, or an https:// link</span>
          <input id="announcement-link" value={link} onChange={(e) => setLink(e.target.value)} className="field h-9 w-full" placeholder="/badges" />
        </label>
        {error && <p className="text-base text-dn">{error}</p>}
        <div>
          <button type="button" onClick={() => void post()} disabled={busy || !body.trim()} className="btn-primary" data-testid="announcement-post">
            {busy ? "Posting…" : "Post to everyone"}
          </button>
        </div>
      </div>
      {list.length > 0 && (
        <div className="mt-5 max-w-xl divide-y divide-border border-y border-border">
          {list.map((a) => (
            <div key={a.id} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-base">{a.body}</p>
                <p className="text-sm text-mute">
                  {timeAgo(a.createdAt)}
                  {a.linkUrl ? ` · ${a.linkUrl}` : ""}
                </p>
              </div>
              <button type="button" onClick={() => void remove(a.id)} className="btn-secondary h-8 shrink-0 px-3">
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
