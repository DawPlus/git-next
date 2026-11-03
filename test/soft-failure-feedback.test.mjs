import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const core = readFileSync(new URL("../src/extension-core.ts", import.meta.url), "utf8");
const panel = readFileSync(new URL("../src/panel-handlers.ts", import.meta.url), "utf8");
const sync = readFileSync(new URL("../src/sync-handler.ts", import.meta.url), "utf8");

test("busy webview clicks surface a soft notice instead of silent return", () => {
  assert.match(core, /noteSoftFailure\("common\.actionBusy"\)/);
  assert.match(core, /function noteSoftFailure/);
  assert.match(core, /webview\.postMessage\(\{\s*type:\s*"gitNextBusyNotice"/);
  assert.match(core, /git-next-busy-banner/);
});

test("second concurrent action records in-view busy notice via postMessage", async () => {
  let running = false;
  const posted = [];
  const fakeWebview = {
    postMessage: async (msg) => { posted.push(msg); },
    onDidReceiveMessage: (fn) => fn,
  };
  const fakeHandler = async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  };

  const listener = fakeWebview.onDidReceiveMessage(async (message) => {
    if (message?.type === "gitNextPerf") return;
    if (running) {
      void fakeWebview.postMessage({ type: "gitNextBusyNotice", message: "busy" });
      return;
    }
    running = true;
    try {
      await fakeHandler();
    } finally {
      running = false;
    }
  });

  const p1 = listener({ type: "action1" });
  const p2 = listener({ type: "action2" });
  await Promise.all([p1, p2]);

  assert.equal(posted.length, 1);
  assert.equal(posted[0].type, "gitNextBusyNotice");
});

test("refresh failures notify instead of empty catch", () => {
  assert.match(panel, /noteSoftFailure\(\)/);
  assert.doesNotMatch(panel, /\.catch\(\(\)\s*=>\s*\{\s*\}\)/);
  assert.match(sync, /noteSoftFailure\(\)/);
  assert.doesNotMatch(sync, /\.catch\(\(\)\s*=>\s*\{\s*\}\)/);
});
