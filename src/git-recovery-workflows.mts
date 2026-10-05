import { runGit } from "./git-command.mjs";

export async function getUndoContext(cwd) {
  const [status, upstream] = await Promise.all([
    runGit(cwd, ["status", "--porcelain=v1"]),
    runGit(cwd, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]),
  ]);
  const pushed = upstream.ok ? await runGit(cwd, ["merge-base", "--is-ancestor", "HEAD", "@{u}"]) : { ok: false };
  return {
    dirty: Boolean(status.detail),
    hasUpstream: upstream.ok,
    headIsInUpstream: pushed.ok,
  };
}

export async function createRecoveryPoint(cwd, action = "manual") {
  const head = await runGit(cwd, ["rev-parse", "HEAD"]);
  if (!head.ok) return { ...head, action: "recovery-point", message: "복구 지점을 만들 HEAD를 확인하지 못했습니다." };

  const actionName = String(action).replace(/[^a-zA-Z0-9-]/g, "-");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const suffix = attempt ? `-${attempt}` : "";
    const name = `git-next-recovery/${actionName}-${stamp}${suffix}`;
    const created = await runGit(cwd, ["branch", name, head.detail]);
    if (created.ok) {
      return {
        ok: true,
        action: "recovery-point",
        name,
        commit: head.detail,
        message: `복구 지점 '${name}'에 현재 커밋을 보관했습니다. Undo의 복구 지점 메뉴에서 복원할 수 있습니다.`,
      };
    }
    if (!/already exists/i.test(created.detail)) {
      return { ...created, action: "recovery-point", message: "복구 지점을 만들지 못했습니다." };
    }
  }
  return { ok: false, action: "recovery-point", message: "고유한 복구 지점 이름을 만들지 못했습니다." };
}

export async function listRecoveryPoints(cwd) {
  const result = await runGit(cwd, [
    "for-each-ref",
    "--format=%(refname:short)%09%(objectname)%09%(subject)",
    "refs/heads/git-next-recovery",
  ]);
  if (!result.ok || !result.detail) return [];
  return result.detail.split("\n").filter(Boolean).map((line) => {
    const [name = "", commit = "", subject = ""] = line.split("\t");
    return { name, commit, subject };
  });
}

export async function restoreFile(cwd, path) {
  const result = await runGit(cwd, ["restore", "--", path]);
  return { ...result, action: "restore-file", message: result.ok ? `${path}의 커밋하지 않은 변경을 되돌렸습니다.` : "파일을 되돌리지 못했습니다." };
}

export async function undoLastLocalCommit(cwd) {
  const result = await runGit(cwd, ["reset", "--soft", "HEAD~1"]);
  return { ...result, action: "undo-local-commit", message: result.ok ? "마지막 로컬 커밋을 취소하고 변경은 그대로 남겼습니다." : "마지막 커밋을 취소하지 못했습니다." };
}

export async function discardTrackedChanges(cwd) {
  const result = await runGit(cwd, ["restore", "--staged", "--worktree", "."]);
  return {
    ...result,
    action: "discard-tracked-changes",
    message: result.ok
      ? "추적 중인 파일의 커밋하지 않은 변경을 버렸습니다. 추적되지 않은 새 파일은 그대로 남아 있습니다."
      : "변경을 버리지 못했습니다.",
  };
}


export async function listReflog(cwd, limit = 30) {
  const result = await runGit(cwd, ["reflog", `--max-count=${limit}`, "--format=%H%x1f%gd%x1f%gs%x1f%cr"]);
  if (!result.ok || !result.detail) return [];
  return result.detail.split("\n").filter(Boolean).map((line) => {
    const [id, ref, subject, relative] = line.split("\x1f");
    return { id, ref, subject, relative };
  });
}
