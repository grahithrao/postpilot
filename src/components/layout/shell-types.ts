export interface ShellCounts {
  pendingApprovals: number;
  scheduled: number;
}

export interface ShellUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string;
}
