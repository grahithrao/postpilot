"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  if (pageCount <= 1) return null;

  function goTo(next: number) {
    const search = new URLSearchParams(params.toString());
    if (next <= 1) search.delete("page");
    else search.set("page", String(next));
    router.push(`${pathname}?${search.toString()}`, { scroll: true });
  }

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  // Compact window around the current page.
  const pages: number[] = [];
  const start = Math.max(1, Math.min(page - 2, pageCount - 4));
  for (let i = start; i <= Math.min(pageCount, start + 4); i++) pages.push(i);

  return (
    <nav className="flex flex-wrap items-center justify-between gap-3" aria-label="Pagination">
      <p className="text-muted-foreground text-xs">
        Showing {from}-{to} of {total}
      </p>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => goTo(page - 1)} aria-label="Previous page">
          <ChevronLeft className="size-4" />
        </Button>
        {pages.map((n) => (
          <Button
            key={n}
            variant={n === page ? "default" : "ghost"}
            size="icon-sm"
            onClick={() => goTo(n)}
            className={cn("tabular-nums", n === page && "pointer-events-none")}
            aria-current={n === page ? "page" : undefined}
          >
            {n}
          </Button>
        ))}
        <Button
          variant="outline"
          size="icon-sm"
          disabled={page >= pageCount}
          onClick={() => goTo(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </nav>
  );
}
