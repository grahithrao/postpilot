import {
  BarChart3,
  CalendarDays,
  LayoutDashboard,
  Library,
  Plug,
  Settings,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  description: string;
  /** Which stat from the shell's counts renders as a badge, if any. */
  badge?: "pendingApprovals" | "scheduled";
}

export const NAV_SECTIONS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Workspace",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        description: "Pipeline health and recent activity",
      },
      { href: "/create", label: "Create", icon: Sparkles, description: "Generate a post with the AI agent" },
      { href: "/content", label: "Content", icon: Library, description: "Every post and its full history" },
      {
        href: "/approvals",
        label: "Approvals",
        icon: ShieldCheck,
        description: "Review what the agent produced",
        badge: "pendingApprovals",
      },
      {
        href: "/calendar",
        label: "Calendar",
        icon: CalendarDays,
        description: "What is going out and when",
        badge: "scheduled",
      },
      { href: "/analytics", label: "Analytics", icon: BarChart3, description: "Engagement and reach" },
    ],
  },
  {
    label: "Configure",
    items: [
      { href: "/integrations", label: "Integrations", icon: Plug, description: "Connected social accounts" },
      { href: "/settings", label: "Settings", icon: Settings, description: "Profile, automations and runtime" },
    ],
  },
];

export const ALL_NAV_ITEMS = NAV_SECTIONS.flatMap((s) => s.items);
