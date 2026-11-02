import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const core = readFileSync(new URL("../src/extension-core.ts", import.meta.url), "utf8");
const view = readFileSync(new URL("../src/sidebar-view.mts", import.meta.url), "utf8");

test("sidebar refresh restores folder and group open state across DOM replacement", () => {
  assert.match(core, /const captureFolds = \(root\) => new Map/);
  assert.match(core, /const restoreFolds = \(root, foldStates\)/);
  const fullReplace = core.indexOf("main.innerHTML = data.mainHtml");
  const scmReplace = core.indexOf("scmRoot.innerHTML = data.scmGroupsHtml");
  assert.ok(fullReplace >= 0);
  assert.ok(scmReplace >= 0);
  assert.match(core, /restoreFolds\(main, foldStates\)/);
  assert.match(core, /restoreFolds\(document, foldStates\)/);
  assert.match(core, /element\.dataset\.folderPath/);
  assert.match(core, /element\.dataset\.area/);
});

test("folder and group details expose stable state keys", () => {
  assert.match(view, /class="scm-folder" data-folder-path="\$\{escapeHtml\(path\)\}" data-area="\$\{area\}"/);
  assert.match(view, /class="scm-group scm-card" data-area="staged"/);
  assert.match(view, /class="scm-group scm-card" data-area="unstaged"/);
});
