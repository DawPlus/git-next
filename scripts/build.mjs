import { execFileSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const dist = new URL("../dist/", import.meta.url);
const tsc = new URL("../node_modules/typescript/bin/tsc", import.meta.url);

await rm(dist, { recursive: true, force: true });

const cwd = fileURLToPath(root);
const runTsc = (configUrl) =>
  execFileSync(process.execPath, [fileURLToPath(tsc), "-p", fileURLToPath(configUrl)], {
    cwd,
    stdio: "inherit",
  });

// Fail closed on type errors before emit. Emit config may keep noCheck for JS interop,
// but shipping without a type gate undermines Safe Guard correctness.
runTsc(new URL("../tsconfig.typecheck.json", import.meta.url));
runTsc(new URL("../tsconfig.json", import.meta.url));
