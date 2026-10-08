import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const core = readFileSync(new URL("../src/extension-core.ts", import.meta.url), "utf8");
const view = readFileSync(new URL("../src/sidebar-view.mts", import.meta.url), "utf8");

test("sidebar refresh restores folder and group open state across DOM replacement", () => {
  const capture = core.indexOf("const foldStates = new Map");
  const replacement = core.indexOf("main.innerHTML = data.mainHtml");
  const restore = core.indexOf("if (foldStates.has(key)) element.open = foldStates.get(key)");
  assert.ok(capture >= 0 && capture < replacement && replacement < restore);
  assert.match(core, /element\.dataset\.folderPath/);
  assert.match(core, /element\.dataset\.area/);
});

test("folder and group details expose stable state keys", () => {
  assert.match(view, /class="scm-folder" data-folder-path="\$\{escapeHtml\(path\)\}" data-area="\$\{area\}"/);
  assert.match(view, /class="scm-group scm-card" data-area="staged"/);
  assert.match(view, /class="scm-group scm-card" data-area="unstaged"/);
});
