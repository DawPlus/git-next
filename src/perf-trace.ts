import { createHash } from "node:crypto";

const PERF_ENV = "GIT_NEXT_PERF";
const DEFAULT_SLOW_MS = 250;

export function isPerfTracingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = String(env[PERF_ENV] ?? "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "on";
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
}: {
  label: string;
  durationMs: number;
  cwd?: string | null;
  slowMs?: number;
}): string {
  const safeLabel = String(label || "operation").replace(/[^a-zA-Z0-9:._-]/g, "_").slice(0, 80);
  const elapsed = Math.max(0, Math.round(durationMs));
  const slow = elapsed >= slowMs ? " slow" : "";
  return `[Git Next perf] repo=${repositoryTraceId(cwd)} op=${safeLabel} ms=${elapsed}${slow}`;
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
    console.debug(formatPerfTrace({ label, durationMs, cwd }));
  }
}
