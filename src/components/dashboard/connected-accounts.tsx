import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import type { Platform, SocialAccountStatus } from "@prisma/client";
import { Plug } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PlatformIcon } from "@/components/shared/platform-badge";
import { platformSpec } from "@/lib/constants/platforms";
import { formatNumber } from "@/lib/utils";

export interface AccountItem {
  id: string;
  platform: Platform;
  handle: string;
  displayName: string;
  status: SocialAccountStatus;
  isDemo: boolean;
  followerCount: number;
  lastSyncedAt: Date | null;
}

export function ConnectedAccounts({ accounts }: { accounts: AccountItem[] }) {
  if (!accounts.length) {
    return (
      <EmptyState
        icon={Plug}
        title="No accounts connected"
        description="Connect a social account before scheduling anything."
        action={
          <Button asChild size="sm">
            <Link href="/integrations">Connect an account</Link>
          </Button>
        }
      />
    );
  }

  return (
    <ul className="divide-y">
      {accounts.map((account) => {
        const spec = platformSpec(account.platform);
        return (
          <li key={account.id} className="flex items-center gap-3 px-5 py-3">
            <span className="bg-muted flex size-7 shrink-0 items-center justify-center rounded-lg">
              <PlatformIcon platform={account.platform} className="text-muted-foreground size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">
                {spec.handlePrefix}
                {account.handle}
              </p>
              <p className="text-muted-foreground mt-0.5 text-[11px]">
                {formatNumber(account.followerCount)} followers
                {account.lastSyncedAt &&
                  ` · synced ${formatDistanceToNow(new Date(account.lastSyncedAt), { addSuffix: true })}`}
              </p>
            </div>
            {account.status === "CONNECTED" ? (
              <Badge variant={account.isDemo ? "warning" : "success"}>{account.isDemo ? "Demo" : "Live"}</Badge>
            ) : (
              <Badge variant="destructive">{account.status.replace("_", " ").toLowerCase()}</Badge>
            )}
          </li>
        );
      })}
    </ul>
  );
}
