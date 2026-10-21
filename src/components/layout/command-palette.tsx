"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Search, Sparkles } from "lucide-react";
import type { PostStatus, Platform } from "@prisma/client";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ALL_NAV_ITEMS } from "./nav-config";
import { StatusBadge } from "@/components/shared/status-badge";
import { PlatformIcon } from "@/components/shared/platform-badge";
import { api } from "@/lib/api/client";
import { cn, truncate } from "@/lib/utils";

interface PostHit {
  id: string;
  topic: string;
  headline: string | null;
  caption: string;
  status: PostStatus;
  platform: Platform;
}

/**
 * Lightweight command palette (Cmd/Ctrl-K).
 *
 * Hand-rolled rather than pulling in a dependency: it needs to do exactly two
 * things — jump between sections and find a post — and both fit in one file.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [hits, setHits] = React.useState<PostHit[]>([]);
  const [active, setActive] = React.useState(0);
  const [searching, setSearching] = React.useState(false);

  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setHits([]);
      setActive(0);
    }
  }, [open]);

  // Debounced content search — nav filtering stays instant and local.
  React.useEffect(() => {
    if (query.trim().length < 2) {
      setHits([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const data = await api<{ items: PostHit[] }>(
          `/api/posts?q=${encodeURIComponent(query.trim())}&pageSize=5`,
        );
        setHits(data.items);
      } catch {
        setHits([]);
      } finally {
        setSearching(false);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [query]);

  const navMatches = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ALL_NAV_ITEMS;
    return ALL_NAV_ITEMS.filter(
      (item) => item.label.toLowerCase().includes(q) || item.description.toLowerCase().includes(q),
    );
  }, [query]);

  const rows = React.useMemo(
    () => [
      ...navMatches.map((item) => ({ kind: "nav" as const, key: item.href, item })),
      ...hits.map((post) => ({ kind: "post" as const, key: post.id, post })),
    ],
    [navMatches, hits],
  );

  React.useEffect(() => setActive(0), [rows.length]);

  function go(index: number) {
    const row = rows[index];
    if (!row) return;
    setOpen(false);
    router.push(row.kind === "nav" ? row.item.href : `/content/${row.post.id}`);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:border-ring/40 hover:text-foreground bg-card flex h-8 w-full max-w-72 items-center gap-2 rounded-lg border px-2.5 text-xs transition-colors"
      >
        <Search className="size-3.5" />
        <span className="flex-1 text-left">Search posts and pages…</span>
        <kbd className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showClose={false} className="top-[18%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0">
          <DialogTitle className="sr-only">Search</DialogTitle>

          <div className="flex items-center gap-2.5 border-b px-4">
            <Search className="text-muted-foreground size-4 shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((i) => Math.min(i + 1, rows.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  go(active);
                }
              }}
              placeholder="Jump to a page or find a post…"
              className="placeholder:text-muted-foreground/70 h-12 w-full bg-transparent text-sm outline-none"
            />
            {searching && <span className="text-muted-foreground text-[10px]">searching…</span>}
          </div>

          <div className="max-h-88 overflow-y-auto p-2">
            {rows.length === 0 ? (
              <p className="text-muted-foreground px-3 py-8 text-center text-xs">
                No matches for “{query}”.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {navMatches.length > 0 && (
                  <li className="text-muted-foreground/70 px-3 pt-1 pb-1 text-[10px] font-semibold tracking-widest uppercase">
                    Go to
                  </li>
                )}
                {rows.map((row, index) => (
                  <React.Fragment key={row.key}>
                    {row.kind === "post" && index === navMatches.length && (
                      <li className="text-muted-foreground/70 px-3 pt-3 pb-1 text-[10px] font-semibold tracking-widest uppercase">
                        Content
                      </li>
                    )}
                    <li>
                      <button
                        type="button"
                        onMouseEnter={() => setActive(index)}
                        onClick={() => go(index)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                          active === index ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
                        )}
                      >
                        {row.kind === "nav" ? (
                          <>
                            <row.item.icon className="text-muted-foreground size-4 shrink-0" />
                            <span className="flex-1 truncate font-medium">{row.item.label}</span>
                            <span className="text-muted-foreground hidden truncate text-[11px] sm:block">
                              {row.item.description}
                            </span>
                          </>
                        ) : (
                          <>
                            <PlatformIcon platform={row.post.platform} className="text-muted-foreground size-4 shrink-0" />
                            <span className="flex-1 truncate">
                              {truncate(row.post.headline || row.post.topic || row.post.caption, 60)}
                            </span>
                            <StatusBadge status={row.post.status} showIcon={false} />
                          </>
                        )}
                        {active === index && <CornerDownLeft className="text-muted-foreground size-3.5 shrink-0" />}
                      </button>
                    </li>
                  </React.Fragment>
                ))}
              </ul>
            )}
          </div>

          <div className="text-muted-foreground flex items-center justify-between border-t px-4 py-2 text-[10px]">
            <span className="flex items-center gap-1.5">
              <Sparkles className="size-3" /> Tip: press ⌘K anywhere
            </span>
            <span className="flex items-center gap-3">
              <span>↑↓ navigate</span>
              <span>↵ open</span>
              <span>esc close</span>
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
