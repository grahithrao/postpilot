"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Home, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  React.useEffect(() => {
    console.error("[app] render error:", error);
  }, [error]);

  return (
    <Card className="mx-auto max-w-lg">
      <div className="flex flex-col items-center px-6 py-14 text-center">
        <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-red-500/10">
          <AlertTriangle className="size-5 text-red-600 dark:text-red-400" />
        </div>
        <p className="text-sm font-medium">Something went wrong on this page</p>
        <p className="text-muted-foreground mt-1.5 max-w-sm text-xs leading-relaxed">
          {error.message || "An unexpected error occurred."}
          {error.digest && <span className="text-muted-foreground/60 mt-1 block font-mono text-[10px]">{error.digest}</span>}
        </p>
        <div className="mt-5 flex gap-2">
          <Button onClick={reset} size="sm">
            <RotateCw className="size-3.5" /> Try again
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard">
              <Home className="size-3.5" /> Dashboard
            </Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}
