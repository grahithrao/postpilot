"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Link2,
  Loader2,
  Lock,
  Plug,
  RefreshCw,
  Unplug,
} from "lucide-react";
import type { IntegrationSummary } from "@/lib/services/integrations";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PlatformIcon } from "@/components/shared/platform-badge";
import { platformSpec } from "@/lib/constants/platforms";
import { api, ApiError } from "@/lib/api/client";
import { cn, formatNumber } from "@/lib/utils";

export function IntegrationsGrid({
  integrations,
  demoMode,
  callbackResult,
}: {
  integrations: IntegrationSummary[];
  demoMode: boolean;
  callbackResult: { kind: "success" | "error"; message: string } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [disconnecting, setDisconnecting] = React.useState<IntegrationSummary | null>(null);

  React.useEffect(() => {
    if (!callbackResult) return;
    if (callbackResult.kind === "success") toast.success("Account connected", { description: callbackResult.message });
    else toast.error("Connection failed", { description: callbackResult.message });
    router.replace("/integrations");
  }, [callbackResult, router]);

  async function connect(integration: IntegrationSummary) {
    setBusy(integration.platform);
    try {
      const result = await api<
        { mode: "oauth"; authorizationUrl: string } | { mode: "demo"; account: { handle: string } }
      >("/api/integrations/connect", { method: "POST", json: { platform: integration.platform } });

      if (result.mode === "oauth") {
        window.location.href = result.authorizationUrl;
        return;
      }
      toast.success(`${integration.name} connected`, {
        description: `Simulated account @${result.account.handle}. Publishing to it is simulated too.`,
      });
      router.refresh();
    } catch (error) {
      toast.error("Could not connect", { description: error instanceof ApiError ? error.message : undefined });
    } finally {
      setBusy(null);
    }
  }

  async function sync(integration: IntegrationSummary) {
    if (!integration.account) return;
    setBusy(integration.platform);
    try {
      await api(`/api/integrations/accounts/${integration.account.id}`, { method: "POST" });
      toast.success(`${integration.name} synced`);
      router.refresh();
    } catch (error) {
      toast.error("Could not sync", { description: error instanceof ApiError ? error.message : undefined });
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(integration: IntegrationSummary) {
    if (!integration.account) return;
    setBusy(integration.platform);
    try {
      await api(`/api/integrations/accounts/${integration.account.id}`, { method: "DELETE" });
      toast.success(`${integration.name} disconnected`, { description: "Stored tokens were destroyed." });
      setDisconnecting(null);
      router.refresh();
    } catch (error) {
      toast.error("Could not disconnect", { description: error instanceof ApiError ? error.message : undefined });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {integrations.map((integration) => {
          const spec = platformSpec(integration.platform);
          const account = integration.account;
          const loading = busy === integration.platform;

          return (
            <Card key={integration.platform} className="flex flex-col">
              <CardHeader className="flex-col items-start gap-3">
                <div className="flex w-full items-start justify-between gap-2">
                  <span className={cn("flex size-9 items-center justify-center rounded-lg border", integration.accent)}>
                    <PlatformIcon platform={integration.platform} className="size-4" />
                  </span>
                  {integration.connected ? (
                    <Badge variant={account?.isDemo ? "warning" : "success"}>
                      {account?.isDemo ? "Demo" : "Live"}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Not connected</Badge>
                  )}
                </div>
                <div>
                  <CardTitle>{integration.name}</CardTitle>
                  <CardDescription>
                    {integration.connected && account
                      ? `${spec.handlePrefix}${account.handle}`
                      : `Publish to ${integration.name} from PostPilot`}
                  </CardDescription>
                </div>
              </CardHeader>

              <CardContent className="flex-1 space-y-2.5">
                {integration.connected && account ? (
                  <dl className="space-y-1.5 text-[11px]">
                    <Row label="Account" value={account.displayName} />
                    <Row label="Followers" value={formatNumber(account.followerCount)} />
                    <Row
                      label="Last sync"
                      value={
                        account.lastSyncedAt
                          ? formatDistanceToNow(new Date(account.lastSyncedAt), { addSuffix: true })
                          : "never"
                      }
                    />
                    <Row label="Posts" value={String(account.postCount)} />
                    <Row
                      label="Token"
                      value={
                        account.hasToken ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                            <Lock className="size-3" /> encrypted
                          </span>
                        ) : (
                          <span className="text-muted-foreground">none (demo)</span>
                        )
                      }
                    />
                  </dl>
                ) : (
                  <p className="text-muted-foreground text-[11px] leading-relaxed">
                    {integration.oauthConfigured
                      ? "OAuth credentials are configured. Connecting opens the platform's consent screen."
                      : `No ${integration.name} OAuth credentials are set, so PostPilot will provision a simulated account instead.`}
                  </p>
                )}

                <div className="flex items-center gap-1.5 pt-1">
                  {integration.oauthConfigured ? (
                    <span className="text-muted-foreground inline-flex items-center gap-1 text-[10px]">
                      <KeyRound className="size-3" /> OAuth configured
                    </span>
                  ) : (
                    <span className="text-muted-foreground/70 inline-flex items-center gap-1 text-[10px]">
                      <KeyRound className="size-3" /> OAuth not configured
                    </span>
                  )}
                </div>
              </CardContent>

              <div className="flex gap-2 border-t px-5 py-3">
                {integration.connected ? (
                  <>
                    <Button variant="outline" size="sm" className="flex-1" disabled={loading} onClick={() => sync(integration)}>
                      {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                      Sync
                    </Button>
                    <Button variant="ghost" size="sm" disabled={loading} onClick={() => setDisconnecting(integration)}>
                      <Unplug className="size-3.5" /> Disconnect
                    </Button>
                  </>
                ) : (
                  <Button size="sm" className="w-full" loading={loading} onClick={() => connect(integration)}>
                    <Plug className="size-3.5" />
                    {integration.oauthConfigured && !demoMode ? "Connect with OAuth" : "Connect demo account"}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* How the integration layer actually works — worth saying plainly. */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>How connections work</CardTitle>
            <CardDescription>The same code path runs in demo and live mode</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: Link2,
              title: "One adapter per platform",
              body: "Each platform implements the same SocialPlatformAdapter interface: connect, disconnect, getAccount, publishPost and getPublishingStatus. Nothing above that layer knows which platform it is talking to.",
            },
            {
              icon: Lock,
              title: "Tokens never leave the server",
              body: "Access and refresh tokens are encrypted with AES-256-GCM before they are written, decrypted only inside an adapter, and are never included in any API response or page payload.",
            },
            {
              icon: demoMode ? AlertTriangle : CheckCircle2,
              title: demoMode ? "Demo Mode is on" : "Live publishing",
              body: demoMode
                ? "Publishing is simulated: content is still validated against each platform's real limits, and a tunable failure rate exercises the retry path — but nothing is sent to a social network."
                : "Publishing uses the credentials configured in your environment and posts to the real platform APIs.",
            },
          ].map((item) => (
            <div key={item.title} className="flex gap-3">
              <span className="bg-muted flex size-7 shrink-0 items-center justify-center rounded-lg">
                <item.icon className="text-muted-foreground size-3.5" />
              </span>
              <div>
                <p className="text-xs font-medium">{item.title}</p>
                <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">{item.body}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <AlertDialog open={Boolean(disconnecting)} onOpenChange={(open) => !open && setDisconnecting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {disconnecting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Stored tokens are destroyed immediately. Already-published posts keep their attribution, but you will not
              be able to schedule anything to this account until you reconnect it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => disconnecting && disconnect(disconnecting)}
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate font-medium">{value}</dd>
    </div>
  );
}
