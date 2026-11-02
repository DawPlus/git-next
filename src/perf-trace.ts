import { appendFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const PERF_ENV = "GIT_NEXT_PERF";
const PERF_LOG_ENV = "GIT_NEXT_PERF_LOG";
/** Touch this file to opt into Stage perf file logging without env vars. */
export const PERF_HOME_FLAG = join(homedir(), ".git-next-perf-on");
export const PERF_HOME_LOG = join(homedir(), ".git-next-perf.log");
const DEFAULT_PERF_LOG = join(tmpdir(), "git-next-stage-perf.log");
const DEFAULT_SLOW_MS = 250;
let developmentTracing = false;
let developmentLogPath: string | null = null;

export function enableDevelopmentPerfTracing(logPath: string = DEFAULT_PERF_LOG): void {
  developmentTracing = true;
  developmentLogPath = String(logPath || DEFAULT_PERF_LOG);
}

function isHomePerfFlagEnabled(): boolean {
  try {
    return existsSync(PERF_HOME_FLAG);
  } catch {
    return false;
  }
}

export function isPerfTracingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = String(env[PERF_ENV] ?? "").trim().toLowerCase();
  return developmentTracing || value === "1" || value === "true" || value === "on" || isHomePerfFlagEnabled();
}

export function getPerfLogPath(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = String(env[PERF_LOG_ENV] ?? "").trim();
  if (value) return value;
  if (developmentLogPath) return developmentLogPath;
  if (isHomePerfFlagEnabled()) return PERF_HOME_LOG;
  return null;
}

export function repositoryTraceId(cwd?: string | null): string {
  if (!cwd) return "none";
  return createHash("sha256").update(cwd).digest("hex").slice(0, 10);
}

export function formatPerfTrace({
  label,
  durationMs,
  cwd,
  slowMs = DEFAULT_SLOW_MS,
  extra = "",
}: {
  label: string;
  durationMs: number;
  cwd?: string | null;
  slowMs?: number;
  extra?: string;
}): string {
  const safeLabel = String(label || "operation").replace(/[^a-zA-Z0-9:._-]/g, "_").slice(0, 80);
  const elapsed = Math.max(0, Math.round(durationMs));
  const slow = elapsed >= slowMs ? " slow" : "";
  const suffix = extra ? ` ${String(extra).trim()}` : "";
  return `[Git Next perf] repo=${repositoryTraceId(cwd)} op=${safeLabel} ms=${elapsed}${slow}${suffix}`;
}

/** Console + optional file sink (`GIT_NEXT_PERF_LOG`) for Extension Host capture. */
export function emitPerfTrace(line: string, env: NodeJS.ProcessEnv = process.env): void {
  const text = String(line ?? "").trimEnd();
  if (!text) return;
  console.debug(text);
  const logPath = getPerfLogPath(env);
  if (!logPath) return;
  try {
    appendFileSync(logPath, `${text}\n`);
  } catch {
    // Measurement must not break Stage/Unstage.
  }
}

export async function traceAsync<T>(
  label: string,
  cwd: string | null | undefined,
  action: () => Promise<T>,
): Promise<T> {
  if (!isPerfTracingEnabled()) return action();

  const started = performance.now();
  try {
    return await action();
  } finally {
    const durationMs = performance.now() - started;
    emitPerfTrace(formatPerfTrace({ label, durationMs, cwd }));
  }
}
