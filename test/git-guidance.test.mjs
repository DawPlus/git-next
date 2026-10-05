import test from "node:test";
import assert from "node:assert/strict";

import { formatStateRiskNext, guidanceNotice } from "../src/git-guidance.mjs";

test("guidance copy always uses state risk next", () => {
  const text = formatStateRiskNext({
    state: "원격이 앞서 있음",
    risk: "바로 Push하면 거절될 수 있음",
    next: "먼저 Pull 또는 비교",
  });
  assert.equal(text, "상태: 원격이 앞서 있음\n위험: 바로 Push하면 거절될 수 있음\n다음: 먼저 Pull 또는 비교");
});

test("guidance notice keeps structured fields and extra metadata", () => {
  const notice = guidanceNotice({
    level: "blocked",
    code: "behind",
    state: "원격이 앞서 있음",
    risk: "기준이 다름",
    next: "Pull",
    actions: ["retry"],
  });
  assert.equal(notice.state, "원격이 앞서 있음");
  assert.equal(notice.level, "blocked");
  assert.deepEqual(notice.actions, ["retry"]);
  assert.match(notice.message, /^상태:/);
});
