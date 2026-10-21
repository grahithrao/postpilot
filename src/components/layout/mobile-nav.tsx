"use client";

import * as React from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { SidebarBrand, SidebarNav } from "./app-sidebar";
import type { ShellCounts } from "./shell-types";

export function MobileNav({ counts }: { counts: ShellCounts }) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
        <Menu className="size-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-0 left-0 max-h-dvh w-72 max-w-[85vw] translate-x-0 translate-y-0 rounded-none rounded-r-xl p-0">
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <div className="flex h-dvh flex-col gap-6 overflow-y-auto py-5">
            <SidebarBrand onNavigate={() => setOpen(false)} />
            <SidebarNav counts={counts} onNavigate={() => setOpen(false)} className="px-2" />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
