import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";
import { isDemoMode } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-muted-foreground mt-1.5 text-sm">Sign in to your PostPilot workspace.</p>
      </div>

      <LoginForm showDemoHint={isDemoMode()} />

      <p className="text-muted-foreground text-center text-xs">
        No account yet?{" "}
        <Link href="/register" className="text-foreground font-medium underline underline-offset-4">
          Create one
        </Link>
      </p>
    </div>
  );
}
