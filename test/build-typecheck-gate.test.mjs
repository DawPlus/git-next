import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const build = readFileSync(new URL("../scripts/build.mjs", import.meta.url), "utf8");

test("build runs typecheck config before emit", () => {
  assert.match(build, /tsconfig\.typecheck\.json/);
  const typecheckAt = build.indexOf("tsconfig.typecheck.json");
  const emitAt = build.lastIndexOf("tsconfig.json");
  assert.ok(typecheckAt >= 0 && emitAt > typecheckAt);
});
