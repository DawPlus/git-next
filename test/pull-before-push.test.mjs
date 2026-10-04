import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("pull-before-push setting exists and is off by default", () => {
  const setting = packageJson.contributes.configuration.properties["gitNext.pullBeforePush"];

  assert.equal(setting.type, "boolean");
  assert.equal(setting.default, false);
});
