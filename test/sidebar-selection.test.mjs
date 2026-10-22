import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { SIDEBAR_INTERACTIONS } from "../src/sidebar-interactions.mts";

test("choose changes opens the list without staging files", () => {
  let click;
  let focused = false;
  let scrolled = false;
  const messages = [];
  const folder = { open: false };
  const group = { open: false, querySelectorAll: () => [folder], scrollIntoView: () => { scrolled = true; }, querySelector: () => ({ focus: () => { focused = true; } }) };
  runInNewContext(SIDEBAR_INTERACTIONS, {
    acquireVsCodeApi: () => ({ postMessage: (message) => messages.push(message) }),
    window: { addEventListener() {} },
    document: { addEventListener: (_, listener) => { click = listener; }, querySelector: (selector) => selector.includes('data-area="unstaged"') ? group : null },
  });
  const button = { dataset: { action: "focusChanges" }, classList: { contains: () => false }, closest: () => null };
  click({ target: { closest: (selector) => selector === "button[data-action]" ? button : null } });
  assert.equal(group.open, true);
  assert.equal(folder.open, true);
  assert.equal(focused && scrolled, true);
  assert.deepEqual(messages, []);
});
