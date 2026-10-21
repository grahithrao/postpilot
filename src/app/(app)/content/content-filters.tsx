"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PostStatus } from "@prisma/client";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { POST_STATUS_LABEL } from "@/lib/constants/labels";
import { PLATFORM_LIST } from "@/lib/constants/platforms";

const SORTS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "quality", label: "Highest quality" },
  { value: "scheduled", label: "By suggested time" },
];

/** Filters are URL state, so any view is shareable and survives a refresh. */
export function ContentFilters({ total }: { total: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [query, setQuery] = React.useState(params.get("q") ?? "");
  const [showDates, setShowDates] = React.useState(Boolean(params.get("from") || params.get("to")));

  const update = React.useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "" || value === "ALL") next.delete(key);
        else next.set(key, value);
      }
      next.delete("page");
      router.push(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  // Debounce the text search so typing does not fire a request per keystroke.
  React.useEffect(() => {
    const current = params.get("q") ?? "";
    if (query === current) return;
    const timer = setTimeout(() => update({ q: query || null }), 350);
    return () => clearTimeout(timer);
  }, [query, params, update]);

  const activeFilters = ["status", "platform", "from", "to", "q"].filter((key) => params.get(key));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search captions, headlines and hashtags…"
            className="pl-8"
            aria-label="Search content"
          />
        </div>

        <Select value={params.get("status") ?? "ALL"} onValueChange={(v) => update({ status: v })}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Any status">
              {params.get("status") ? POST_STATUS_LABEL[params.get("status") as PostStatus] : "Any status"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Any status</SelectItem>
            {Object.values(PostStatus).map((status) => (
              <SelectItem key={status} value={status}>
                {POST_STATUS_LABEL[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={params.get("platform") ?? "ALL"} onValueChange={(v) => update({ platform: v })}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Any platform">
              {params.get("platform")
                ? PLATFORM_LIST.find((p) => p.id === params.get("platform"))?.name
                : "Any platform"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Any platform</SelectItem>
            {PLATFORM_LIST.map((spec) => (
              <SelectItem key={spec.id} value={spec.id}>
                {spec.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={params.get("sort") ?? "newest"} onValueChange={(v) => update({ sort: v })}>
          <SelectTrigger className="w-44">
            <SelectValue>{SORTS.find((s) => s.value === (params.get("sort") ?? "newest"))?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((sort) => (
              <SelectItem key={sort.value} value={sort.value}>
                {sort.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant={showDates ? "secondary" : "outline"}
          size="icon"
          onClick={() => setShowDates((v) => !v)}
          aria-label="Date filter"
        >
          <SlidersHorizontal className="size-4" />
        </Button>
      </div>

      {showDates && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label className="text-muted-foreground text-[11px] font-medium" htmlFor="from">
              Created from
            </label>
            <Input
              id="from"
              type="date"
              className="w-40"
              value={params.get("from") ?? ""}
              onChange={(e) => update({ from: e.target.value || null })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-muted-foreground text-[11px] font-medium" htmlFor="to">
              Created to
            </label>
            <Input
              id="to"
              type="date"
              className="w-40"
              value={params.get("to") ?? ""}
              onChange={(e) => update({ to: e.target.value || null })}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <p className="text-muted-foreground text-xs">
          {total} post{total === 1 ? "" : "s"}
          {activeFilters.length > 0 && " matching your filters"}
        </p>
        {activeFilters.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[11px]"
            onClick={() => {
              setQuery("");
              setShowDates(false);
              router.push(pathname, { scroll: false });
            }}
          >
            <X className="size-3" /> Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
