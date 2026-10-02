"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui";
import { fmtUsd } from "@/lib/format";
import type { SearchResults } from "@/lib/search";

/**
 * Header search across members, tokens and pools (/api/search). Desktop: a field beside the nav;
 * phones: an icon that opens a full-screen search. `/` or ⌘K focuses it; arrows + Enter pick a
 * result; Esc closes. Members only (rendered by AppShell for members).
 */

type Item = { key: string; href: string; group: "Members" | "Tokens" | "Pools"; render: () => React.ReactNode };

const DEBOUNCE_MS = 200;
const MIN = 2;

function SearchIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
      <circle cx="9" cy="9" r="5.5" />
      <path d="M13.5 13.5L17 17" />
    </svg>
  );
}

function TokenIcon({ src, label }: { src: string | null; label: string }) {
  const [failed, setFailed] = useState(false);
  return src && !failed ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="h-6 w-6 shrink-0 rounded-full bg-surface-raised object-cover" onError={() => setFailed(true)} />
  ) : (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-raised text-xs text-mute" aria-hidden="true">
      {label.slice(0, 1)}
    </span>
  );
}

function useSearch(query: string) {
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal, cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<SearchResults>) : null))
        .then((d) => {
          if (d) setResults(d);
        })
        .catch(() => undefined)
        .finally(() => {
          if (!ctrl.signal.aborted) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);
  return { results, loading };
}

function toItems(r: SearchResults | null): Item[] {
  if (!r) return [];
  return [
    ...r.users.map((u) => ({
      key: `u${u.id}`,
      href: u.href,
      group: "Members" as const,
      render: () => (
        <>
          <Avatar user={{ id: u.id, xAvatarUrl: u.xAvatarUrl }} size={24} />
          <span className="min-w-0 flex-1 truncate text-fg">{u.name}</span>
          <span className="num shrink-0 text-sm text-mute">{u.xHandle ? `@${u.xHandle}` : u.memberNumber ? `#${u.memberNumber}` : ""}</span>
        </>
      ),
    })),
    ...r.tokens.map((t) => ({
      key: `t${t.mint}`,
      href: t.href,
      group: "Tokens" as const,
      render: () => (
        <>
          <TokenIcon src={t.icon} label={t.symbol} />
          <span className="shrink-0 font-medium text-fg">{t.symbol}</span>
          <span className="min-w-0 flex-1 truncate text-sm text-mute">{t.name}</span>
          {t.verified && <span className="chip shrink-0">Verified</span>}
        </>
      ),
    })),
    ...r.pools.map((p) => ({
      key: `p${p.address}`,
      href: p.href,
      group: "Pools" as const,
      render: () => (
        <>
          <span className="flex shrink-0">
            <TokenIcon src={p.tokenXIcon} label={p.name} />
            <span className="-ml-2">
              <TokenIcon src={p.tokenYIcon} label={p.name.split("-")[1] ?? p.name} />
            </span>
          </span>
          <span className="min-w-0 flex-1 truncate text-fg">{p.name}</span>
          {p.binStep != null && <span className="num shrink-0 text-sm text-mute">{p.binStep}bp</span>}
          {p.tvl != null && <span className="num shrink-0 text-sm text-mute">{fmtUsd(p.tvl)}</span>}
        </>
      ),
    })),
  ];
}

/** Input + grouped results list; shared by the desktop dropdown and the phone sheet. */
function SearchBox({ autoFocus = false, onDone, variant }: { autoFocus?: boolean; onDone?: () => void; variant: "dropdown" | "sheet" }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const { results, loading } = useSearch(query);
  const items = useMemo(() => toItems(results), [results]);

  useEffect(() => setActive(0), [results]);

  // `/` or ⌘K / Ctrl+K focuses the desktop field from anywhere (not while typing elsewhere).
  useEffect(() => {
    if (variant !== "dropdown") return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if ((e.key === "/" && !typing) || (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [variant]);

  // Close the dropdown on outside click.
  useEffect(() => {
    if (variant !== "dropdown" || !open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [variant, open]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      setQuery("");
      inputRef.current?.blur();
      onDone?.();
      router.push(href);
    },
    [router, onDone]
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && items.length) {
      e.preventDefault();
      setActive((a) => (a + 1) % items.length);
    } else if (e.key === "ArrowUp" && items.length) {
      e.preventDefault();
      setActive((a) => (a - 1 + items.length) % items.length);
    } else if (e.key === "Enter" && items[active]) {
      e.preventDefault();
      go(items[active].href);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      onDone?.();
    }
  };

  const q = query.trim();
  const showList = variant === "sheet" || (open && q.length >= MIN);
  const optionId = (i: number) => `${listId}-o${i}`;

  const list = (
    <div
      id={listId}
      role="listbox"
      aria-label="Search results"
      className={variant === "dropdown" ? "card absolute left-0 right-0 top-full z-50 mt-2 max-h-[70vh] overflow-y-auto p-1.5 shadow-lg shadow-black/40" : "mt-3 max-h-[calc(100dvh-9rem)] overflow-y-auto"}
    >
      {q.length < MIN ? (
        <p className="px-3 py-2.5 text-sm text-mute">Search members, tokens and pools by name, symbol or address.</p>
      ) : items.length === 0 ? (
        <p className="px-3 py-2.5 text-sm text-mute">{loading ? "Searching…" : `No results for “${q}”.`}</p>
      ) : (
        items.map((it, i) => (
          <div key={it.key}>
            {(i === 0 || items[i - 1].group !== it.group) && (
              <div className="px-3 pb-1 pt-2.5 text-xs font-medium text-mute" role="presentation">
                {it.group}
              </div>
            )}
            <div
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => go(it.href)}
              className={`flex h-11 cursor-pointer items-center gap-2.5 rounded-tile px-3 ${i === active ? "bg-surface-raised" : ""}`}
            >
              {it.render()}
            </div>
          </div>
        ))
      )}
    </div>
  );

  return (
    <div ref={boxRef} className={variant === "dropdown" ? "relative w-56 lg:w-72" : "flex min-h-0 flex-1 flex-col"}>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-mute">
          <SearchIcon />
        </span>
        <input
          ref={inputRef}
          type="text"
          inputMode="search"
          enterKeyHint="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && items[active] ? optionId(active) : undefined}
          aria-label="Search members, tokens and pools"
          placeholder="Search"
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="field h-9 pl-9 pr-10"
          data-testid="global-search"
        />
        {variant === "dropdown" && (
          <kbd className="pointer-events-none absolute inset-y-0 right-2.5 my-auto flex h-5 items-center rounded border border-border px-1.5 text-xs text-mute">/</kbd>
        )}
      </div>
      {showList && list}
    </div>
  );
}

export function GlobalSearch() {
  const [sheet, setSheet] = useState(false);
  useEffect(() => {
    if (!sheet) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sheet]);

  return (
    <>
      <div className="hidden md:block">
        <SearchBox variant="dropdown" />
      </div>
      <button type="button" className="btn-ghost h-9 w-9 px-0 md:hidden" aria-label="Search" onClick={() => setSheet(true)} data-testid="global-search-open">
        <SearchIcon className="h-5 w-5" />
      </button>
      {/* Portal: the header is its own stacking layer, so render the sheet at the top of the page. */}
      {sheet &&
        createPortal(
        <div className="fixed inset-0 z-[60] flex flex-col bg-bg p-4 md:hidden" role="dialog" aria-modal="true" aria-label="Search">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <SearchBox variant="sheet" autoFocus onDone={() => setSheet(false)} />
            </div>
          </div>
          <button type="button" className="btn-ghost mt-3 self-center" onClick={() => setSheet(false)}>
            Cancel
          </button>
        </div>,
          document.body
        )}
    </>
  );
}
