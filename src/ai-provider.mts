import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildDiagnosisPrompt, validateDiagnosis } from "./ai-diagnosis.mjs";

function parseJson(text: unknown): any {
  const source = String(text ?? "").trim();
  try {
    return JSON.parse(source);
  } catch {
    const start = source.indexOf("{");
    const end = source.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(source.slice(start, end + 1));
    throw new Error("AI 응답에서 JSON을 찾지 못했습니다.");
  }
}

export function runCodexCommand({ prompt, cwd, output, spawnImpl = spawn, timeoutMs = 60000 }: { prompt: string; cwd: string; output: string; spawnImpl?: typeof spawn; timeoutMs?: number }) {
  return new Promise<void>((resolve, reject) => {
    const child = spawnImpl("codex", [
      "exec",
      "--ephemeral",
      "--sandbox", "read-only",
      "--skip-git-repo-check",
      "--ignore-rules",
      "-o", output,
      prompt,
    ], { cwd, stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    let settled = false;
    const finish = (error?: Error | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(() => {
      child.kill?.();
      finish(new Error("Codex diagnosis timed out."));
    }, timeoutMs);
    timer.unref?.();

    child.stderr?.on("data", (chunk) => { stderr += chunk; });
    child.on("error", finish);
    child.on("close", (code) => {
      if (code === 0) finish();
      else finish(new Error(stderr.trim() || `Codex exited with ${code}`));
    });

    // Codex 0.160+ may inspect piped stdin even when PROMPT is positional.
    // Explicit EOF prevents it from waiting for an additional <stdin> block.
    child.stdin?.end();
  });
}

async function defaultRunCodex({ prompt, cwd }: { prompt: string; cwd: string }): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "git-next-ai-"));
  const output = path.join(dir, "diagnosis.json");
  try {
    await runCodexCommand({ prompt, cwd, output });
    return readFile(output, "utf8");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function defaultFetchJson({ endpoint, model, prompt }: { endpoint: string; model: string; prompt: string }): Promise<any> {
  const response = await fetch(`${endpoint.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
  return response.json();
}

export async function diagnoseWithProvider({
  provider,
  context,
  cwd = process.cwd(),
  endpoint = "http://127.0.0.1:11434",
  model = "",
  runCodex = defaultRunCodex,
  fetchJson = defaultFetchJson,
}: { provider?: string; context?: any; cwd?: string; endpoint?: string; model?: string; runCodex?: any; fetchJson?: any } = {}) {
  if (!provider || provider === "off") {
    return { ok: false, code: "provider-not-configured", message: "AI 진단 Provider가 설정되지 않았습니다." };
  }

  const prompt = buildDiagnosisPrompt(context);
  try {
    let raw;
    if (provider === "codex") {
      raw = parseJson(await runCodex({ prompt, cwd }));
    } else if (provider === "ollama") {
      if (!model) return { ok: false, code: "model-not-configured", message: "Ollama 모델을 설정하세요." };
      const response = await fetchJson({ endpoint, model, prompt });
      raw = parseJson(response?.message?.content ?? response?.response);
    } else {
      return { ok: false, code: "unsupported-provider", message: `지원하지 않는 AI Provider입니다: ${provider}` };
    }

    const validated = validateDiagnosis(raw);
    if (!validated.ok) return { ok: false, code: "invalid-diagnosis", message: validated.message };
    return { ok: true, provider, diagnosis: validated.value };
  } catch (error) {
    return {
      ok: false,
      code: "provider-failed",
      message: "AI 진단 요청에 실패했습니다.",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
