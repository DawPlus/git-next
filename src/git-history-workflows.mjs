import { runGit, parseNameStatus, parseSubjects } from "./git-command.mjs";

import { getWorkingTreeChanges } from "./git-safety.mjs";

export async function compareBranches(cwd, base, other) {
  const [counts, baseOnly, otherOnly, files, mergeBase] = await Promise.all([
    runGit(cwd, ["rev-list", "--left-right", "--count", `${base}...${other}`]),
    runGit(cwd, ["log", "--oneline", `${other}..${base}`]),
    runGit(cwd, ["log", "--oneline", `${base}..${other}`]),
    runGit(cwd, ["diff", "--name-status", `${base}...${other}`]),
    runGit(cwd, ["merge-base", base, other]),
  ]);
  const mergeBaseDetails = mergeBase.ok
    ? await runGit(cwd, ["show", "-s", "--format=%H%x1f%s", mergeBase.detail])
    : { ok: false, detail: "" };
  const [mergeBaseId = null, ...mergeBaseSubjectParts] = mergeBaseDetails.ok ? mergeBaseDetails.detail.split("\x1f") : [];
  const [baseCount = 0, otherCount = 0] = counts.ok ? counts.detail.split(/\s+/).map(Number) : [0, 0];
  return {
    base,
    other,
    mergeBase: mergeBaseId,
    mergeBaseSubject: mergeBaseSubjectParts.join("\x1f"),
    baseCount,
    otherCount,
    baseOnly: baseOnly.ok ? parseSubjects(baseOnly.detail) : [],
    otherOnly: otherOnly.ok ? parseSubjects(otherOnly.detail) : [],
    files: files.ok ? parseNameStatus(files.detail) : [],
  };
}

export async function getForceWithLeasePreview(cwd) {
  const branch = await runGit(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  if (!branch.ok) return { ok: false, code: "detached-head", message: "현재 브랜치에 들어가 있지 않은 커밋에서는 이 Push 방법을 사용할 수 없습니다. 먼저 브랜치를 선택하거나 새로 만들어주세요." };
  const [remoteResult, mergeResult] = await Promise.all([
    runGit(cwd, ["config", "--get", `branch.${branch.detail}.remote`]),
    runGit(cwd, ["config", "--get", `branch.${branch.detail}.merge`]),
  ]);
  const remote = remoteResult.detail;
  const remoteRef = mergeResult.detail;
  if (!remoteResult.ok || !mergeResult.ok || !remote || !/^refs\/heads\//.test(remoteRef)) {
    return { ok: false, code: "no-upstream", message: "안전하게 원격 기록을 덮어쓰려면 현재 브랜치가 원격 브랜치와 연결되어 있어야 합니다." };
  }
  const tip = await runGit(cwd, ["ls-remote", "--heads", remote, remoteRef]);
  const [expected = "", returnedRef = ""] = tip.detail.split(/\s+/);
  if (!tip.ok || !/^[0-9a-f]{40,64}$/i.test(expected) || returnedRef !== remoteRef) {
    return { ok: false, code: "remote-tip-unavailable", message: "원격 브랜치의 최신 Commit을 확인하지 못해 안전한 강제 Push를 진행할 수 없습니다.", detail: tip.detail };
  }
  return { ok: true, branch: branch.detail, remote, remoteRef, expected };
}

export async function getCommitContainment(cwd, commit, ref = "HEAD") {
  const [commitObject, refObject] = await Promise.all([
    runGit(cwd, ["rev-parse", "--verify", `${commit}^{commit}`]),
    runGit(cwd, ["rev-parse", "--verify", `${ref}^{commit}`]),
  ]);
  if (!commitObject.ok || !refObject.ok) {
    return { ok: false, contained: false, commit, ref, detail: !commitObject.ok ? commitObject.detail : refObject.detail };
  }

  const relation = await runGit(cwd, ["merge-base", "--is-ancestor", commitObject.detail, refObject.detail]);
  return {
    ok: true,
    contained: relation.ok,
    commit: commitObject.detail,
    ref,
    target: refObject.detail,
  };
}


export async function getFileHistory(cwd, filePath, limit = 20) {
  const count = Math.max(1, Math.min(100, Number(limit) || 20));
  const result = await runGit(cwd, ["log", "--follow", `-n${count}`, "--format=%H%x1f%s", "--", filePath]);
  if (!result.ok || !result.detail) return [];
  return result.detail.split("\n").map((line) => {
    const [id, ...subject] = line.split("\x1f");
    return { id, message: subject.join("\x1f") };
  }).filter(({ id }) => id);
}

export async function readGitFile(cwd, ref, path) {
  const result = await runGit(cwd, ["show", `${ref}:${path}`]);
  return result.ok ? { ok: true, content: result.detail } : { ok: false, content: "", detail: result.detail };
}

export async function getCommitDetails(cwd, commit) {
  const [meta, files] = await Promise.all([
    runGit(cwd, ["show", "-s", "--format=%H%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%B", commit]),
    runGit(cwd, ["diff-tree", "--root", "--no-commit-id", "--name-status", "-r", "-M", commit]),
  ]);
  if (!meta.ok) {
    return { ok: false, commit, files: [], message: "커밋 정보를 읽지 못했습니다.", detail: meta.detail };
  }

  const [id = commit, parentsRaw = "", author = "", email = "", authoredAt = "", ...messageParts] = meta.detail.split("\x1f");
  return {
    ok: true,
    id,
    parents: parentsRaw.split(/\s+/).filter(Boolean),
    author,
    email,
    authoredAt,
    message: messageParts.join("\x1f").trim(),
    files: files.ok ? parseNameStatus(files.detail) : [],
  };
}

export async function getStashDetails(cwd, ref) {
  const [files, stat, changes] = await Promise.all([
    runGit(cwd, ["stash", "show", "--include-untracked", "--name-status", ref]),
    runGit(cwd, ["stash", "show", "--include-untracked", "--stat", ref]),
    getWorkingTreeChanges(cwd),
  ]);
  const parsedFiles = files.ok ? parseNameStatus(files.detail) : [];
  const stashPaths = new Set(parsedFiles.flatMap((file) => [file.path, file.oldPath].filter(Boolean)));
  return {
    ref,
    files: parsedFiles,
    stat: stat.ok ? stat.detail : "",
    overlap: [...new Set(changes.filter((change) => stashPaths.has(change.path)).map((change) => change.path))],
  };
}

export async function getBranchesContainingCommit(cwd, commit) {
  const result = await runGit(cwd, ["branch", "--contains", commit, "--format=%(refname:short)"]);
  return result.ok && result.detail
    ? result.detail.split("\n").filter((name) => name && !name.startsWith("("))
    : [];
}
