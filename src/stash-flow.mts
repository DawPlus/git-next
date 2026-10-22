import { runGit } from "./git-command.mjs";

type StashFlow = { commit: string; branch: string; phase: "pull" | "restore" | "cleanup" | "conflict" };
const flows = new Map<string, StashFlow>();
type FlowStorage = { get(key: string, fallback: unknown): any; update(key: string, value: unknown): PromiseLike<void> };
let storage: FlowStorage | null = null;

export function configureStashFlowStorage(next: FlowStorage | null) {
  storage = next;
  flows.clear();
  const saved = storage?.get("gitNext.stashFlows", {}) ?? {};
  for (const [cwd, entry] of Object.entries(saved) as Array<[string, StashFlow]>) {
    if (entry && /^[a-f0-9]{40,64}$/i.test(entry.commit) && typeof entry.branch === "string" && ["pull", "restore", "cleanup", "conflict"].includes(entry.phase)) flows.set(cwd, entry);
  }
}

async function persist() {
  try {
    await storage?.update("gitNext.stashFlows", Object.fromEntries(flows));
  } catch (error) {
    // Git already completed; a storage failure must not misreport the Git result.
    console.warn("[Git Next] Could not persist stash guidance", error);
  }
}

export async function rememberStashForPull(cwd: string, commit: string | null) {
  if (!commit) return;
  const branch = await runGit(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  if (branch.ok) { flows.set(cwd, { commit, branch: branch.detail, phase: "pull" }); await persist(); }
}

export async function getStashFlow(cwd: string) {
  const flow = flows.get(cwd);
  if (!flow) return null;
  const [branch, stashes] = await Promise.all([
    runGit(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]),
    runGit(cwd, ["stash", "list", "--format=%H%x00%gd"]),
  ]);
  if (!stashes.ok) return null;
  const entry = stashes.detail.split("\n").map((line) => line.split("\0")).find(([commit]) => commit === flow.commit);
  if (!entry) { flows.delete(cwd); await persist(); return null; }
  if (!branch.ok || branch.detail !== flow.branch) return null;
  return { ...flow, ref: entry[1] };
}

export async function markStashPulled(cwd: string) {
  const flow = await getStashFlow(cwd);
  if (flow?.phase === "pull") { flows.get(cwd)!.phase = "restore"; await persist(); }
}

export async function recordStashOutcome(cwd: string, commit: string, action: "apply" | "pop" | "drop", ok: boolean, conflict = false) {
  const flow = flows.get(cwd);
  if (!flow || flow.commit !== commit) return;
  if (ok && (action === "pop" || action === "drop")) { flows.delete(cwd); await persist(); return; }
  if (ok && action === "apply") flow.phase = "cleanup";
  if (!ok && conflict) flow.phase = "conflict";
  await persist();
}
