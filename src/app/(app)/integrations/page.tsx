import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Plug } from "lucide-react";
import { currentUser } from "@/lib/auth";
import { publicRuntimeFlags } from "@/lib/env";
import { listIntegrations } from "@/lib/services/integrations";
import { PageHeader } from "@/components/layout/page-header";
import { DemoBadge } from "@/components/shared/demo-badge";
import { IntegrationsGrid } from "./integrations-grid";

export const metadata: Metadata = { title: "Integrations" };
export const dynamic = "force-dynamic";

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const [integrations, params] = await Promise.all([listIntegrations(user.id), searchParams]);
  const flags = publicRuntimeFlags();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integrations"
        description="Connect the accounts PostPilot publishes to. Tokens are encrypted at rest and never reach the browser."
        actions={<DemoBadge flags={flags} />}
      />

      {/* Integrations Explainer */}
      <div className="flex items-start gap-3 rounded-xl border border-sky-100/90 bg-sky-50/70 p-4 text-xs text-slate-700 shadow-2xs dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-slate-300">
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-sky-600 text-white shadow-xs dark:bg-sky-500 dark:text-slate-950">
          <Plug className="size-3.5" />
        </span>
        <div className="space-y-1">
          <p className="font-semibold text-slate-900 dark:text-white">Secure Social Connectivity & Demo Mode</p>
          <p className="leading-relaxed text-slate-600 dark:text-slate-400">
            Connect your LinkedIn, X, Instagram, or Facebook profiles via standard OAuth 2.0. Access tokens are encrypted at rest using AES-256-GCM. In Demo Mode, accounts simulate publishing responses and errors safely without broadcasting to live feeds.
          </p>
        </div>
      </div>
      <IntegrationsGrid
        integrations={integrations}
        demoMode={flags.demoMode}
        callbackResult={
          params.connected
            ? { kind: "success" as const, message: `Connected as ${params.connected}.` }
            : params.error
              ? { kind: "error" as const, message: params.error }
              : null
        }
      />
    </div>
  );
}
