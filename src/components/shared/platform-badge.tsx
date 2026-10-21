import type { Platform } from "@prisma/client";
import { Facebook, Instagram, Linkedin, type LucideIcon } from "lucide-react";
import { platformSpec } from "@/lib/constants/platforms";
import { cn } from "@/lib/utils";

/** X has no Lucide glyph, so the wordmark is drawn directly. */
function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

const ICONS: Record<Platform, LucideIcon | typeof XIcon> = {
  LINKEDIN: Linkedin,
  INSTAGRAM: Instagram,
  FACEBOOK: Facebook,
  X: XIcon,
};

export function PlatformIcon({ platform, className }: { platform: Platform; className?: string }) {
  const Icon = ICONS[platform];
  return <Icon className={cn("size-4", className)} />;
}

export function PlatformBadge({
  platform,
  className,
  showLabel = true,
}: {
  platform: Platform;
  className?: string;
  showLabel?: boolean;
}) {
  const spec = platformSpec(platform);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] leading-5 font-medium whitespace-nowrap",
        spec.accent,
        className,
      )}
    >
      <PlatformIcon platform={platform} className="size-3" />
      {showLabel && spec.name}
    </span>
  );
}
