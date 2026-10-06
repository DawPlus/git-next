import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const out = `git-next-${pkg.version}.vsix`;
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(npx, ["--yes", "@vscode/vsce", "package", "--allow-missing-repository", "--out", out], { stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
