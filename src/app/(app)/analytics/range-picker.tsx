"use client";

import { usePathname, useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

export function RangePicker({ days }: { days: number }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <Tabs value={String(days)} onValueChange={(v) => router.push(`${pathname}?days=${v}`)}>
      <TabsList>
        {RANGES.map((range) => (
          <TabsTrigger key={range.days} value={String(range.days)}>
            {range.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
