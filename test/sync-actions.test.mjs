import assert from "node:assert/strict";
import test from "node:test";

import { explainGitError } from "../src/git-actions.mts";
import { renderGraphHtml } from "../src/graph-view.mts";

test("explains common push rejection in plain language", () => {
  const message = explainGitError("push", "rejected non-fast-forward");

  assert.match(message, /원격/);
  assert.match(message, /받기/);
});

test("renders pull and push controls with upstream relationship", () => {
  const html = renderGraphHtml({
    kind: "repository",
    root: "/repo",
    branch: "main",
    upstream: "origin/main",
    head: null,
    refs: [],
    commits: [],
  });

  assert.match(html, /data-action="pull"/);
  assert.match(html, /data-action="push"/);
  assert.match(html, /origin\/main/);
});
