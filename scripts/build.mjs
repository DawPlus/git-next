import { execFileSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const dist = new URL("../dist/", import.meta.url);
const tsc = new URL("../node_modules/typescript/bin/tsc", import.meta.url);

await rm(dist, { recursive: true, force: true });

execFileSync(process.execPath, [fileURLToPath(tsc), "-p", fileURLToPath(new URL("../tsconfig.json", import.meta.url))], {
  cwd: fileURLToPath(root),
  stdio: "inherit",
});
