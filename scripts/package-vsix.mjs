import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(pkg.version)) {
  throw new Error(`Invalid package version: ${pkg.version}`);
}

const out = `git-next-${pkg.version}.vsix`;
const vsceArgs = ["--yes", "@vscode/vsce", "package", "--allow-missing-repository", "--out", out];
const result = spawnSync("npx", vsceArgs, { stdio: "inherit", shell: true });

if (result.error) throw result.error;
process.exit(result.status ?? 1);
