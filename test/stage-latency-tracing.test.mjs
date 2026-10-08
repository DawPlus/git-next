import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("Stage instrumentation measures dispatch, Git, cache and render with a shared trace ID", () => {
  const interaction = read("../src/sidebar-interactions.mts");
  const handler = read("../src/webview-message-handler.ts");
  assert.match(interaction, /stageTraceId/);
  assert.match(interaction, /stage:dispatch/);
  assert.doesNotMatch(interaction, /setTimeout\(\(\) =>[\s\S]*?vscode\.postMessage\(message\)[\s\S]*?, 180\)/);
  assert.match(handler, /stage:root:/);
  assert.match(handler, /getCachedState\(cwd\)\?\.root \?\? await getRepositoryRoot\(cwd\)/);
  assert.match(handler, /\^\[0-9\]\+\-\[0-9\]\+\$/);
  assert.match(handler, /stage:git:/);
  assert.match(handler, /stage:cache:/);
  assert.match(handler, /applyWorkingTreeCacheAction\(cwd, \{/);
  assert.doesNotMatch(handler, /applyWorkingTreeCacheAction\(root, \{/);
  assert.match(handler, /stage:render:/);
});

test("Stage UI tracing measures DOM work and is opt-in", () => {
  const core = read("../src/extension-core.ts");
  assert.match(core, /stage:dom:/);
  assert.match(core, /isPerfTracingEnabled/);
  assert.match(core, /stageTraceId/);
});
