import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { existsSync } from "node:fs";

import {
  emitPerfTrace,
  formatPerfTrace,
  getPerfLogPath,
  isPerfTracingEnabled,
  PERF_HOME_FLAG,
  repositoryTraceId,
  traceAsync,
} from "../src/perf-trace.ts";

test("performance tracing is disabled by default and opt-in by environment flag", () => {
  // Home flag (~/.git-next-perf-on) may be present during a live measurement session.
  if (!existsSync(PERF_HOME_FLAG)) {
    assert.equal(isPerfTracingEnabled({}), false);
    assert.equal(isPerfTracingEnabled({ GIT_NEXT_PERF: "0" }), false);
  }
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

test("emitPerfTrace appends to GIT_NEXT_PERF_LOG when set", () => {
  const dir = mkdtempSync(join(tmpdir(), "git-next-perf-log-"));
  const logPath = join(dir, "perf.log");
  const previousLog = process.env.GIT_NEXT_PERF_LOG;
  const originalDebug = console.debug;
  console.debug = () => {};

  try {
    process.env.GIT_NEXT_PERF_LOG = logPath;
    assert.equal(getPerfLogPath(), logPath);
    emitPerfTrace("[Git Next perf] repo=none op=stage:total:1-2 ms=42 rows=10");
    const body = readFileSync(logPath, "utf8");
    assert.match(body, /op=stage:total:1-2 ms=42 rows=10/);
  } finally {
    console.debug = originalDebug;
    if (previousLog === undefined) delete process.env.GIT_NEXT_PERF_LOG;
    else process.env.GIT_NEXT_PERF_LOG = previousLog;
    rmSync(dir, { recursive: true, force: true });
  }
});
