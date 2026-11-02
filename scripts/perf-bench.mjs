#!/usr/bin/env node
/**
 * Reproducible Stage/Unstage + Push/Pull hot-path bench (no VS Code UI).
 * Usage: GIT_NEXT_PERF=1 node scripts/perf-bench.mjs
 */
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { performance } from "node:perf_hooks";

import { stageFile, unstageFile } from "../src/git-change-workflows.mts";
import { getWorkingTreeChanges, getTrackingStatus, preflightPushSafety, preflightPullSafety } from "../src/git-safety.mts";
import { getRepositoryState, getBranchRepositoryState } from "../src/git-state.mts";
import { getActionImpactPreview } from "../src/git-operation-workflows.mts";
import { renderSidebarHtml, renderSidebarStagePatch } from "../src/sidebar-view.mts";
import { setLocale } from "../src/i18n.mts";

const exec = promisify(execFile);
const SIZES = (process.env.PERF_SIZES ?? "10,100,500").split(",").map((n) => Number(n.trim())).filter(Boolean);
const REPEAT = Number(process.env.PERF_REPEAT ?? 3);

async function git(cwd, ...args) {
  const { stdout } = await exec("git", args, { cwd, encoding: "utf8" });
  return stdout.trim();
}

async function makeRepo(fileCount) {
  const cwd = await mkdtemp(join(tmpdir(), `git-next-perf-${fileCount}-`));
  await git(cwd, "init", "-q", "-b", "main");
  await git(cwd, "config", "user.email", "perf@example.com");
  await git(cwd, "config", "user.name", "Perf Bench");
  await mkdir(join(cwd, "src"), { recursive: true });
  for (let i = 0; i < fileCount; i += 1) {
    await writeFile(join(cwd, "src", `f${String(i).padStart(4, "0")}.txt`), `base-${i}\n`);
  }
  await git(cwd, "add", ".");
  await git(cwd, "commit", "-qm", "base");
  // Dirty working tree: modify every file
  for (let i = 0; i < fileCount; i += 1) {
    await appendFile(join(cwd, "src", `f${String(i).padStart(4, "0")}.txt`), `dirty-${i}\n`);
  }
  // Fake upstream for push/pull preflight paths that need @{u}
  await git(cwd, "remote", "add", "origin", cwd);
  await git(cwd, "update-ref", "refs/remotes/origin/main", "HEAD");
  await git(cwd, "branch", "--set-upstream-to=origin/main", "main");
  return cwd;
}

async function time(label, fn) {
  const started = performance.now();
  const value = await fn();
  return { label, ms: Math.round(performance.now() - started), value };
}

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    min: sorted[0],
    median: sorted[Math.floor(sorted.length / 2)],
    max: sorted[sorted.length - 1],
    avg: Math.round(sum / sorted.length),
  };
}

async function benchSize(fileCount) {
  const cwd = await makeRepo(fileCount);
  const target = `src/f${String(0).padStart(4, "0")}.txt`;
  const rows = [];

  try {
    // Warm git
    await getWorkingTreeChanges(cwd);

    const stageSamples = [];
    const unstageSamples = [];
    const wtSamples = [];
    const fullStateSamples = [];
    const branchStateSamples = [];
    const pushPreflightSamples = [];
    const pullPreflightSamples = [];
    const impactPushSamples = [];
    const impactPullSamples = [];
    const htmlSamples = [];
    const patchSamples = [];

    for (let i = 0; i < REPEAT; i += 1) {
      // Ensure target is unstaged dirty
      await unstageFile(cwd, target).catch(() => {});
      await appendFile(join(cwd, target), `touch-${i}\n`);

      stageSamples.push((await time("stageFile", () => stageFile(cwd, target))).ms);
      unstageSamples.push((await time("unstageFile", () => unstageFile(cwd, target))).ms);
      wtSamples.push((await time("workingTree", () => getWorkingTreeChanges(cwd))).ms);
      fullStateSamples.push((await time("repoState", () => getRepositoryState(cwd, { limit: 100 }))).ms);
      branchStateSamples.push((await time("branchState", () => getBranchRepositoryState(cwd))).ms);
      pushPreflightSamples.push((await time("pushPreflight", () => preflightPushSafety(cwd))).ms);
      pullPreflightSamples.push((await time("pullPreflight", () => preflightPullSafety(cwd))).ms);
      impactPushSamples.push((await time("pushImpact", () => getActionImpactPreview(cwd, "push"))).ms);
      impactPullSamples.push((await time("pullImpact", () => getActionImpactPreview(cwd, "pull"))).ms);

      const changes = await getWorkingTreeChanges(cwd);
      const state = {
        kind: "repository",
        branch: "main",
        upstream: "origin/main",
        tracking: await getTrackingStatus(cwd),
        changes,
        nextAction: { kind: "dirty", title: "dirty", detail: "bench" },
      };
      setLocale("ko");
      htmlSamples.push((await time("sidebarHtml", () => renderSidebarHtml(state))).ms);
      patchSamples.push((await time("sidebarPatch", () => renderSidebarStagePatch(state))).ms);
    }

    const pack = (name, samples) => ({ name, ...stats(samples) });
    rows.push(
      pack("stageFile", stageSamples),
      pack("unstageFile", unstageSamples),
      pack("getWorkingTreeChanges", wtSamples),
      pack("getRepositoryState(limit=100)", fullStateSamples),
      pack("getBranchRepositoryState", branchStateSamples),
      pack("preflightPushSafety", pushPreflightSamples),
      pack("preflightPullSafety", pullPreflightSamples),
      pack("pushImpactPreview", impactPushSamples),
      pack("pullImpactPreview", impactPullSamples),
      pack("renderSidebarHtml", htmlSamples),
      pack("renderSidebarStagePatch", patchSamples),
    );

    return { fileCount, cwd, rows };
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

function printTable(fileCount, rows) {
  console.log(`\n=== files=${fileCount} repeat=${REPEAT} ===`);
  console.log(
    "op".padEnd(32),
    "min".padStart(6),
    "med".padStart(6),
    "avg".padStart(6),
    "max".padStart(6),
  );
  for (const row of rows) {
    console.log(
      row.name.padEnd(32),
      String(row.min).padStart(6),
      String(row.median).padStart(6),
      String(row.avg).padStart(6),
      String(row.max).padStart(6),
    );
  }
}

const started = performance.now();
console.log(JSON.stringify({
  git: (await exec("git", ["--version"], { encoding: "utf8" })).stdout.trim(),
  node: process.version,
  sizes: SIZES,
  repeat: REPEAT,
  note: "Host-side hot paths only. VS Code webview click-to-paint needs Extension Host + GIT_NEXT_PERF console.",
}, null, 2));

const results = [];
for (const size of SIZES) {
  const result = await benchSize(size);
  printTable(size, result.rows);
  results.push({ fileCount: size, rows: result.rows });
}

const outPath = process.env.PERF_OUT || `/tmp/git-next-perf-${Date.now()}.json`;
await writeFile(outPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  totalMs: Math.round(performance.now() - started),
  results,
}, null, 2));
console.log(`\nWrote ${outPath}`);
