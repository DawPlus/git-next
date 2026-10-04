import { copyFile, mkdir } from "node:fs/promises";

await mkdir(new URL("../dist/", import.meta.url), { recursive: true });

for (const file of ["extension.js", "git-state.mjs", "git-actions.mjs", "git-safety.mjs", "safe-guard.mjs", "graph-view.mjs", "glossary-view.mjs", "git-guide.mjs", "git-workflows.mjs", "workspace-views.mjs"]) {
  await copyFile(
    new URL(`../src/${file}`, import.meta.url),
    new URL(`../dist/${file}`, import.meta.url),
  );
}
