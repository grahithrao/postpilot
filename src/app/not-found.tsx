import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <div className="bg-muted mb-5 flex size-12 items-center justify-center rounded-xl">
        <Compass className="text-muted-foreground size-5" />
      </div>
      <h1 className="text-lg font-semibold tracking-tight">Page not found</h1>
      <p className="text-muted-foreground mt-1.5 max-w-sm text-sm">
        The page you were looking for does not exist.
      </p>
      <Link
        href="/dashboard"
        className="bg-primary text-primary-foreground mt-6 inline-flex h-9 items-center rounded-lg px-4 text-sm font-medium shadow-sm transition-opacity hover:opacity-90"
      >
        Go to the dashboard
      </Link>
    </main>
  );
}
