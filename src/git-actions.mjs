import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function explainGitError(action, detail) {
  const text = String(detail ?? "");

  if (/non-fast-forward|rejected/i.test(text)) {
    return "원격 브랜치에 아직 받지 않은 변경이 있습니다. 먼저 받기(Pull)한 뒤 결과를 확인하고 다시 보내세요.";
  }

  if (/no tracking information|no upstream branch|set-upstream/i.test(text)) {
    return "현재 브랜치가 원격 브랜치와 연결되어 있지 않습니다.";
  }

  if (/not a git repository/i.test(text)) {
    return "현재 폴더에서 Git 저장소를 찾지 못했습니다.";
  }

  if (/conflict|automatic merge failed|unmerged/i.test(text)) {
    return "충돌이 발생했습니다. 충돌 파일을 직접 정리한 뒤 다시 시도하세요.";
  }

  if (action === "pull" && /fast-forward|diverg/i.test(text)) {
    return "로컬과 원격의 커밋 흐름이 갈라졌습니다. 양쪽 변경을 확인한 뒤 정리하세요.";
  }

  return action === "pull"
    ? "변경 내용을 받아오지 못했습니다. Git 상세 정보를 열어 저장소 상태를 확인하세요."
    : "변경 내용을 보내지 못했습니다. Git 상세 정보를 열어 저장소 상태를 확인하세요.";
}

async function run(cwd, args) {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd,
      encoding: "utf8",
      windowsHide: true,
    });

    return {
      ok: true,
      detail: [stdout, stderr].filter(Boolean).join("\n").trim(),
    };
  } catch (error) {
    const detail = [error?.stdout, error?.stderr, error?.message]
      .filter(Boolean)
      .join("\n")
      .trim();

    return {
      ok: false,
      detail,
    };
  }
}

export async function pullRepository(cwd) {
  const result = await run(cwd, ["pull", "--ff-only"]);
  return {
    ...result,
    action: "pull",
    message: result.ok ? "원격 변경 내용을 받아왔습니다." : explainGitError("pull", result.detail),
  };
}

export async function pushRepository(cwd) {
  const result = await run(cwd, ["push"]);
  return {
    ...result,
    action: "push",
    message: result.ok ? "로컬 변경 내용을 원격에 보냈습니다." : explainGitError("push", result.detail),
  };
}

export async function validateBranchName(cwd, name) {
  if (!name?.trim()) {
    return { ok: false, message: "브랜치 이름을 입력하세요." };
  }

  const result = await run(cwd, ["check-ref-format", "--branch", name.trim()]);
  return result.ok
    ? { ok: true, name: name.trim() }
    : { ok: false, message: "사용할 수 없는 브랜치 이름입니다.", detail: result.detail };
}

export async function validateTagName(cwd, name) {
  if (!name?.trim()) {
    return { ok: false, message: "태그 이름을 입력하세요." };
  }

  const clean = name.trim();
  const result = await run(cwd, ["check-ref-format", `refs/tags/${clean}`]);
  return result.ok
    ? { ok: true, name: clean }
    : { ok: false, message: "사용할 수 없는 태그 이름입니다.", detail: result.detail };
}

export async function createTag(cwd, name, target = "HEAD") {
  const result = await run(cwd, ["tag", name, target]);
  return {
    ...result,
    action: "create-tag",
    message: result.ok
      ? `태그 '${name}'를 만들었습니다. 대상: ${target}`
      : "태그를 만들지 못했습니다. 이름 중복 여부와 대상 커밋을 확인하세요.",
  };
}

export async function deleteTag(cwd, name) {
  const result = await run(cwd, ["tag", "-d", name]);
  return {
    ...result,
    action: "delete-tag",
    message: result.ok
      ? `로컬 태그 '${name}'를 삭제했습니다. 원격 태그는 변경하지 않았습니다.`
      : "태그를 삭제하지 못했습니다.",
  };
}

export async function createBranch(cwd, name, target = "HEAD") {
  const result = await run(cwd, ["branch", name, target]);
  return {
    ...result,
    action: "create-branch",
    message: result.ok
      ? `브랜치 '${name}'를 만들었습니다. 현재 브랜치는 바뀌지 않았습니다.`
      : "브랜치를 만들지 못했습니다. 이름 중복 여부와 대상 커밋을 확인하세요.",
  };
}

export async function checkoutBranch(cwd, name) {
  const result = await run(cwd, ["switch", name]);
  return {
    ...result,
    action: "switch-branch",
    message: result.ok
      ? `브랜치 '${name}'로 전환했습니다.`
      : "브랜치를 전환하지 못했습니다. Git 상세 정보를 확인하세요.",
  };
}

export async function createTrackingBranch(cwd, localName, remoteRef) {
  const result = await run(cwd, ["switch", "-c", localName, "--track", remoteRef]);
  return {
    ...result,
    action: "create-tracking-branch",
    message: result.ok
      ? `원격 '${remoteRef}'를 추적하는 로컬 브랜치 '${localName}'를 만들고 전환했습니다.`
      : "원격 추적 브랜치를 만들지 못했습니다.",
  };
}

export async function renameBranch(cwd, oldName, newName) {
  const result = await run(cwd, ["branch", "-m", oldName, newName]);
  return {
    ...result,
    action: "rename-branch",
    message: result.ok
      ? `브랜치 '${oldName}'의 이름을 '${newName}'로 바꿨습니다. 원격 브랜치 이름은 자동으로 바뀌지 않습니다.`
      : "브랜치 이름을 바꾸지 못했습니다.",
  };
}

export async function getBranchDeleteInfo(cwd, name) {
  const merged = await run(cwd, ["merge-base", "--is-ancestor", name, "HEAD"]);
  const count = await run(cwd, ["rev-list", "--count", `HEAD..${name}`]);

  return {
    merged: merged.ok,
    uniqueCommitCount: count.ok ? Number(count.detail || 0) : null,
  };
}

export async function deleteBranch(cwd, name, force = false) {
  const result = await run(cwd, ["branch", force ? "-D" : "-d", name]);
  return {
    ...result,
    action: "delete-branch",
    message: result.ok
      ? `브랜치 '${name}'를 삭제했습니다.`
      : "브랜치를 삭제하지 못했습니다.",
  };
}

export async function listStashes(cwd) {
  const result = await run(cwd, ["stash", "list", "--format=%gd%x1f%gs%x1f%cr"]);
  if (!result.ok || !result.detail) {
    return [];
  }

  return result.detail
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [ref, message = "", relative = ""] = line.split("\x1f");
      return { ref, message, relative };
    });
}

export async function stashPush(cwd, message = "Git Next 임시 저장") {
  const result = await run(cwd, ["stash", "push", "-u", "-m", message]);
  return {
    ...result,
    action: "stash-push",
    message: result.ok
      ? "커밋하지 않은 변경을 Stash에 임시 저장했습니다. 일반 커밋은 생성되지 않았습니다."
      : "변경 내용을 Stash에 저장하지 못했습니다.",
  };
}

export async function stashApply(cwd, ref) {
  const result = await run(cwd, ["stash", "apply", ref]);
  return {
    ...result,
    action: "stash-apply",
    message: result.ok
      ? `${ref}의 변경을 작업 폴더에 적용했습니다. Stash 항목은 그대로 남아 있습니다.`
      : "Stash를 적용하지 못했습니다. 충돌이 발생했을 수 있습니다.",
  };
}

export async function stashPop(cwd, ref) {
  const result = await run(cwd, ["stash", "pop", ref]);
  return {
    ...result,
    action: "stash-pop",
    message: result.ok
      ? `${ref}의 변경을 적용하고 Stash 목록에서 제거했습니다.`
      : "Stash Pop을 완료하지 못했습니다. 충돌이 발생했다면 먼저 파일을 정리하세요.",
  };
}

export async function stashDrop(cwd, ref) {
  const result = await run(cwd, ["stash", "drop", ref]);
  return {
    ...result,
    action: "stash-drop",
    message: result.ok
      ? `${ref}를 삭제했습니다. 이 Stash는 더 이상 목록에서 복원할 수 없습니다.`
      : "Stash를 삭제하지 못했습니다.",
  };
}

export async function cherryPickCommit(cwd, commit) {
  const result = await run(cwd, ["cherry-pick", commit]);
  return {
    ...result,
    action: "cherry-pick",
    message: result.ok
      ? `커밋 ${commit.slice(0, 7)}의 변경을 현재 브랜치에 복사했습니다.`
      : "Cherry-pick을 완료하지 못했습니다. 충돌이 있다면 계속/취소 전에 상태를 확인하세요.",
  };
}

export async function revertCommit(cwd, commit) {
  const result = await run(cwd, ["revert", "--no-edit", commit]);
  return {
    ...result,
    action: "revert",
    message: result.ok
      ? `커밋 ${commit.slice(0, 7)}의 변경을 되돌리는 새 커밋을 만들었습니다. 기존 기록은 유지됩니다.`
      : "Revert를 완료하지 못했습니다. 충돌이 있다면 상태를 확인하세요.",
  };
}
