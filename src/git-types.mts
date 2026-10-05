export type GitRefKind = "local" | "remote" | "tag";

export interface GitCommit {
  id: string;
  parents: string[];
  author: string;
  authoredAt: string;
  message: string;
}

export interface GitRef {
  name: string;
  fullName: string;
  target: string;
  kind: GitRefKind;
  upstream: string | null;
}

export interface GitWorktree {
  path: string;
  branch: string | null;
  detached: boolean;
  isCurrent: boolean;
}

export type TrackingKind =
  | "ahead"
  | "behind"
  | "diverged"
  | "up-to-date"
  | "no-upstream"
  | "unknown";

export interface TrackingStatus {
  kind: TrackingKind;
  ahead: number;
  behind: number;
  upstream?: string | null;
}

export interface WorkingTreeChange {
  status: string;
  path: string;
}

export interface RepositoryState {
  kind: "repository" | "no-repository";
  root: string | null;
  branch: string | null;
  upstream: string | null;
  head: string | null;
  refs: GitRef[];
  commits: GitCommit[];
}

export interface NameStatusEntry {
  status: string;
  oldPath: string | null;
  path: string;
}

export interface CommitSubject {
  id: string;
  subject: string;
}

export interface GitCommandResult {
  ok: boolean;
  detail: string;
}

export type GitEnvironment = NodeJS.ProcessEnv;
