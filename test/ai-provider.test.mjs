import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import { diagnoseWithProvider, runCodexCommand } from "../src/ai-provider.mts";

const diagnosis = {
  situation: "diverged",
  summary: "양쪽에 다른 커밋이 있습니다.",
  risk: "기록을 덮을 수 있습니다.",
  next: "Merge 또는 Rebase를 선택하세요.",
  guideKey: "diverged",
  recommendedAction: "merge",
  confidence: "high",
};

test("codex CLI closes stdin so positional prompts do not wait for more input", async () => {
  const calls = [];
  let stdinEnded = false;
  await runCodexCommand({
    prompt: "diagnose",
    cwd: "/repo",
    output: "/tmp/diagnosis.json",
    spawnImpl(command, args, options) {
      calls.push({ command, args, options });
      const child = new EventEmitter();
      child.stderr = new PassThrough();
      child.stdin = new PassThrough();
      const originalEnd = child.stdin.end.bind(child.stdin);
      child.stdin.end = (...endArgs) => {
        stdinEnded = true;
        const result = originalEnd(...endArgs);
        queueMicrotask(() => child.emit("close", 0));
        return result;
      };
      return child;
    },
  });

  assert.equal(stdinEnded, true);
  assert.deepEqual(calls[0].options.stdio, ["pipe", "ignore", "pipe"]);
  assert.equal(calls[0].args.at(-1), "diagnose");
});

test("codex provider validates structured output", async () => {
  const calls = [];
  const result = await diagnoseWithProvider({
    provider: "codex",
    context: { branch: "main", changedFiles: [] },
    cwd: "/repo",
    runCodex: async (input) => {
      calls.push(input);
      return JSON.stringify(diagnosis);
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.diagnosis.animationPreset, "diverged");
  assert.equal(calls[0].cwd, "/repo");
  assert.match(calls[0].prompt, /JSON만/);
});

test("ollama provider forwards endpoint/model and validates output", async () => {
  const calls = [];
  const result = await diagnoseWithProvider({
    provider: "ollama",
    context: { branch: "main", changedFiles: [] },
    endpoint: "http://127.0.0.1:11434",
    model: "local-model",
    fetchJson: async (input) => {
      calls.push(input);
      return { message: { content: JSON.stringify(diagnosis) } };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(calls[0].model, "local-model");
  assert.equal(calls[0].endpoint, "http://127.0.0.1:11434");
});

test("provider rejects missing configuration and invalid model output", async () => {
  assert.deepEqual(await diagnoseWithProvider({ provider: "off", context: {} }), {
    ok: false,
    code: "provider-not-configured",
    message: "AI 진단 Provider가 설정되지 않았습니다.",
  });

  const invalid = await diagnoseWithProvider({
    provider: "codex",
    context: {},
    runCodex: async () => '{"summary":"missing fields"}',
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.code, "invalid-diagnosis");
});
