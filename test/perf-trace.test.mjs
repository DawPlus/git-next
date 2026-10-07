import assert from "node:assert/strict";
import test from "node:test";

import {
  formatPerfTrace,
  isPerfTracingEnabled,
  repositoryTraceId,
  traceAsync,
} from "../src/perf-trace.ts";

test("performance tracing is disabled by default and opt-in by environment flag", () => {
  assert.equal(isPerfTracingEnabled({}), false);
  assert.equal(isPerfTracingEnabled({ GIT_NEXT_PERF: "0" }), false);
  assert.equal(isPerfTracingEnabled({ GIT_NEXT_PERF: "1" }), true);
  assert.equal(isPerfTracingEnabled({ GIT_NEXT_PERF: "true" }), true);
  assert.equal(isPerfTracingEnabled({ GIT_NEXT_PERF: "on" }), true);
});

test("performance trace output uses a path-safe repository id and omits the original path", () => {
  const cwd = "C:\\workspace\\secret-project";
  const id = repositoryTraceId(cwd);
  const line = formatPerfTrace({
    label: "git:push origin super-secret",
    durationMs: 321.4,
    cwd,
    slowMs: 250,
  });

  assert.match(id, /^[a-f0-9]{10}$/);
  assert.match(line, new RegExp(`repo=${id}`));
  assert.match(line, /op=git:push_origin_super-secret/);
  assert.match(line, /ms=321 slow$/);
  assert.equal(line.includes(cwd), false);
  assert.equal(line.includes("C:\\workspace"), false);
});

test("traceAsync logs only when performance tracing is enabled", async () => {
  const previous = process.env.GIT_NEXT_PERF;
  const originalDebug = console.debug;
  const lines = [];
  console.debug = (value) => lines.push(String(value));

  try {
    delete process.env.GIT_NEXT_PERF;
    assert.equal(await traceAsync("test:off", "C:\\repo", async () => 1), 1);
    assert.equal(lines.length, 0);

    process.env.GIT_NEXT_PERF = "1";
    assert.equal(await traceAsync("test:on", "C:\\repo", async () => 2), 2);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /op=test:on/);
  } finally {
    console.debug = originalDebug;
    if (previous === undefined) delete process.env.GIT_NEXT_PERF;
    else process.env.GIT_NEXT_PERF = previous;
  }
});
