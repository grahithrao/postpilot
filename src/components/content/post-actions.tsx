"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Platform, PostStatus } from "@prisma/client";
import { toast } from "sonner";
import {
  CalendarClock,
  CalendarX,
  Copy,
  ExternalLink,
  Eye,
  MoreHorizontal,
  RotateCw,
  Send,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { ScheduleDialog, type ScheduleAccount } from "./schedule-dialog";
import { api, ApiError } from "@/lib/api/client";

export interface PostActionTarget {
  id: string;
  status: PostStatus;
  platform: Platform;
  publishedUrl?: string | null;
  suggestedTime?: string | null;
  scheduledFor?: string | null;
}

/**
 * The per-post action menu.
 *
 * Every item is either enabled and functional, or hidden because the post's
 * status makes it meaningless — no dead buttons.
 */
export function PostActions({
  post,
  accounts,
  variant = "menu",
}: {
  post: PostActionTarget;
  accounts: ScheduleAccount[];
  variant?: "menu" | "inline";
}) {
  const router = useRouter();
  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const canSchedule = ["APPROVED", "FAILED"].includes(post.status);
  const canReschedule = post.status === "SCHEDULED";
  const canSubmit = ["DRAFT", "REJECTED"].includes(post.status);
  const canPublishNow = ["APPROVED", "FAILED"].includes(post.status);
  const canDelete = post.status !== "PUBLISHING";

  async function run(label: string, fn: () => Promise<unknown>, successMessage: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(successMessage);
      router.refresh();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : `Could not ${label}.`;
      toast.error(error instanceof ApiError && error.isApprovalBlock ? "Blocked" : `Could not ${label}`, {
        description: message,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-1.5">
        {variant === "inline" && canSchedule && (
          <Button size="sm" variant="outline" onClick={() => setScheduleOpen(true)}>
            <CalendarClock className="size-3.5" /> Schedule
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" disabled={busy} aria-label="Post actions">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem asChild>
              <Link href={`/content/${post.id}`}>
                <Eye /> Open
              </Link>
            </DropdownMenuItem>

            {post.publishedUrl && (
              <DropdownMenuItem asChild>
                <a href={post.publishedUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink /> View published post
                </a>
              </DropdownMenuItem>
            )}

            {canSubmit && (
              <DropdownMenuItem
                onClick={() =>
                  run("send for approval", () => api(`/api/posts/${post.id}/submit`, { method: "POST" }), "Sent for approval")
                }
              >
                <ShieldCheck /> Send for approval
              </DropdownMenuItem>
            )}

            {(canSchedule || canReschedule) && (
              <DropdownMenuItem onClick={() => setScheduleOpen(true)}>
                <CalendarClock /> {canReschedule ? "Reschedule" : "Schedule"}
              </DropdownMenuItem>
            )}

            {canReschedule && (
              <DropdownMenuItem
                onClick={() =>
                  run(
                    "cancel the schedule",
                    () => api(`/api/posts/${post.id}/schedule`, { method: "DELETE" }),
                    "Schedule cancelled",
                  )
                }
              >
                <CalendarX /> Cancel schedule
              </DropdownMenuItem>
            )}

            {canPublishNow && (
              <DropdownMenuItem
                onClick={() =>
                  run(
                    "publish",
                    () => api(`/api/posts/${post.id}/publish`, { method: "POST" }),
                    post.status === "FAILED" ? "Retrying now" : "Publishing now",
                  )
                }
              >
                {post.status === "FAILED" ? <RotateCw /> : <Send />}
                {post.status === "FAILED" ? "Retry publishing" : "Publish now"}
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onClick={() =>
                run(
                  "duplicate",
                  () => api(`/api/posts/${post.id}/duplicate`, { method: "POST" }),
                  "Duplicated as a new draft",
                )
              }
            >
              <Copy /> Duplicate
            </DropdownMenuItem>

            {canDelete && (
              <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ScheduleDialog
        postId={post.id}
        platform={post.platform}
        suggestedTime={post.suggestedTime}
        currentScheduledFor={canReschedule ? post.scheduledFor : null}
        accounts={accounts}
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this post?</AlertDialogTitle>
            <AlertDialogDescription>
              Its revisions, approvals, schedules and publishing logs are deleted with it. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                run("delete", () => api(`/api/posts/${post.id}`, { method: "DELETE" }), "Post deleted")
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
