import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(pkg.version)) {
  throw new Error(`Invalid package version: ${pkg.version}`);
}

const out = `git-next-${pkg.version}.vsix`;
const vsceArgs = ["--yes", "@vscode/vsce", "package", "--allow-missing-repository", "--out", out];
const result = process.platform === "win32"
  ? spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `npx ${vsceArgs.map((arg) => `"${arg}"`).join(" ")}`], { stdio: "inherit" })
  : spawnSync("npx", vsceArgs, { stdio: "inherit" });

if (result.error) throw result.error;
process.exit(result.status ?? 1);
