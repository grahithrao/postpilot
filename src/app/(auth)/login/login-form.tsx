"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { AlertCircle, LogIn, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DEMO = { email: "demo@postpilot.app", password: "demo1234" };

export function LoginForm({ showDemoHint }: { showDemoHint: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const callbackUrl = params.get("callbackUrl") ?? "/dashboard";

  async function submit(credentials: { email: string; password: string }) {
    setLoading(true);
    setError(null);
    const result = await signIn("credentials", { ...credentials, redirect: false });
    if (result?.error) {
      setError("That email and password combination did not match an account.");
      setLoading(false);
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit({ email, password });
      }}
    >
      {showDemoHint && (
        <div className="bg-sky-50/80 border-sky-200/90 dark:bg-sky-950/40 dark:border-sky-900/60 rounded-xl border p-4 shadow-xs">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-800 dark:text-sky-300">
            <Wand2 className="size-3.5 text-sky-600 dark:text-sky-400" />
            <span>1-Click Demo Sign-In</span>
          </div>
          <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">
            Pre-loaded with 28 posts, approval queue items, and simulated analytics.
          </p>
          <div className="mt-2 text-[11px] font-mono text-slate-600 dark:text-slate-400 bg-white/70 dark:bg-slate-900/70 rounded-md px-2 py-1 border border-sky-100 dark:border-slate-800">
            {DEMO.email} · {DEMO.password}
          </div>
          <Button
            type="button"
            size="sm"
            className="mt-3 w-full bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs shadow-xs cursor-pointer"
            loading={loading}
            onClick={() => {
              setEmail(DEMO.email);
              setPassword(DEMO.password);
              void submit(DEMO);
            }}
          >
            <LogIn className="size-3.5" /> Sign in with Demo Workspace
          </Button>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </div>

      {error && (
        <p className="text-destructive flex items-start gap-2 text-xs" role="alert">
          <AlertCircle className="mt-px size-3.5 shrink-0" />
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" loading={loading}>
        <LogIn className="size-4" /> Sign in
      </Button>
    </form>
  );
}
