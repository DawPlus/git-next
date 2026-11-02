#!/usr/bin/env node
/**
 * Build multi-root Stage latency fixtures for T-261102-06.
 * Usage: node scripts/perf-stage-fixtures.mjs
 */
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const ROOT = join(tmpdir(), "git-next-stage-perf");
const SIZES = [10, 100, 500];
const PERF_LOG = join(tmpdir(), "git-next-stage-perf.log");

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function makeRepo(fileCount) {
  const dir = join(ROOT, `files-${fileCount}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  git(dir, ["init", "-b", "main"]);
  git(dir, ["config", "user.name", "Git Next Perf"]);
  git(dir, ["config", "user.email", "perf@git-next.test"]);
  writeFileSync(join(dir, "README.md"), `# stage perf ${fileCount}\n`);
  git(dir, ["add", "README.md"]);
  git(dir, ["commit", "-m", "base"]);
  for (let i = 0; i < fileCount; i += 1) {
    const name = `src/f${String(i).padStart(4, "0")}.txt`;
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, name), `dirty-${i}\n`);
  }
  return dir;
}

rmSync(ROOT, { recursive: true, force: true });
mkdirSync(ROOT, { recursive: true });
if (existsSync(PERF_LOG)) rmSync(PERF_LOG);

const folders = SIZES.map((size) => {
  const path = makeRepo(size);
  console.log(`ready ${path} (${size} dirty files)`);
  return { path, name: `files-${size}` };
});

const workspacePath = join(ROOT, "stage-perf.code-workspace");
writeFileSync(
  workspacePath,
  `${JSON.stringify({ folders: folders.map(({ path, name }) => ({ path, name })), settings: {} }, null, 2)}\n`,
);

const launchHint = join(ROOT, "HOW-TO.txt");
writeFileSync(
  launchHint,
  [
    "Git Next Stage click-to-paint baseline (T-261102-06)",
    "",
    `1. Clear log: rm -f ${PERF_LOG}`,
    "2. From repo root, F5 (Run Extension) OR:",
    `   GIT_NEXT_PERF_LOG=${PERF_LOG} \\`,
    "   \"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code\" \\",
    "     --extensionDevelopmentPath=/Users/doh/workspace/git-next \\",
    `     ${workspacePath}`,
    "3. In Extension Development Host: open Git Next sidebar.",
    "4. For each folder files-10 / files-100 / files-500:",
    "   - Select that workspace folder if needed",
    "   - Stage one unstaged file (mini Stage button)",
    "   - Optional: Unstage the same file once",
    "5. Wait ~2s after last click (external refresh debounce window).",
    `6. Tell the agent: log ready at ${PERF_LOG}`,
    "",
  ].join("\n"),
);

console.log(`\nworkspace: ${workspacePath}`);
console.log(`perf log:  ${PERF_LOG}`);
console.log(`howto:     ${launchHint}`);
