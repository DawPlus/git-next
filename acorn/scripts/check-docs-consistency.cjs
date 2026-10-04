#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

let failed = false;
const { parseBoard, boardValue } = require("./board.cjs");
const fail = (message) => {
  console.error(`FAIL: ${message}`);
  failed = true;
};

const required = [
  "AGENTS.md",
  "acorn/config.json",
  "acorn/state.json",
  "acorn/workflow/workflow.md",
  "acorn/workflow/closeout.md",
  "acorn/workflow/tickets.md",
];

for (const file of required) {
  if (!fs.existsSync(file)) fail(`missing ${file}`);
}

let config = {};
try {
  config = JSON.parse(fs.readFileSync("acorn/config.json", "utf8"));
} catch {
  fail("invalid acorn/config.json");
}

const qaExecutor = config.roles?.qa?.executor;
if (!["human", "agent", "off"].includes(qaExecutor)) {
  fail(`invalid roles.qa.executor: ${qaExecutor}`);
}

const boardPath = config.ticketBoardPath || "docs/tickets/board.md";
if (!fs.existsSync(boardPath)) fail(`missing ${boardPath}`);

const parsed = parseBoard(fs.existsSync(boardPath) ? fs.readFileSync(boardPath, "utf8") : "");
for (const column of ["Ticket", "State", "Next"]) {
  if (!parsed.headers.includes(column)) fail(`missing required board column: ${column}`);
}
const allowedStates = new Set(["draft", "ready", "in_progress", "review", "ready_for_qa", "blocked", "done", "superseded"]);
const roles = new Set(Object.keys(config.roles || {}).map((role) => role.toLowerCase()));
for (const row of parsed.rows) {
  const value = (name) => boardValue(parsed, row, name);
  if (row.length !== parsed.headers.length) fail(`invalid board row width: ${value("Ticket")}`);
  if (!allowedStates.has(value("State"))) fail(`invalid ticket state: ${value("State")}`);
  if (value("Role") && roles.size && !roles.has(value("Role").toLowerCase())) fail(`unknown ticket role: ${value("Role")}`);
  if (value("Mode") && !["confirm-only", "implementation"].includes(value("Mode"))) fail(`invalid ticket mode: ${value("Mode")}`);
}

if (fs.existsSync("acorn/state.json") && fs.existsSync(boardPath)) {
  try {
    const state = JSON.parse(fs.readFileSync("acorn/state.json", "utf8"));
    if (state.phase && !config.workflow?.phases?.includes(state.phase)) {
      fail(`invalid state phase: ${state.phase}`);
    }
    if (state.activeTicket) {
      const row = parsed.rows.find((row) => boardValue(parsed, row, "Ticket") === state.activeTicket);
      if (!row) {
        fail(`active ticket missing from board: ${state.activeTicket}`);
      } else {
        const ticketState = boardValue(parsed, row, "State");
        if (ticketState === "done" || ticketState === "superseded") {
          fail(`active ticket is terminal on board: ${state.activeTicket} (${ticketState})`);
        }
      }
    }
  } catch {
    fail("invalid acorn/state.json");
  }
}

function markdownFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(target);
    return entry.name.endsWith(".md") ? [target] : [];
  });
}

for (const file of ["docs", "acorn"].flatMap(markdownFiles)) {
  const content = fs.readFileSync(file, "utf8");
  for (const match of content.matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1].replace(/^<|>$/g, "").split(/[?#]/)[0];
    if (
      !target ||
      /^(https?:|mailto:|app:|file:|#)/.test(target) ||
      (!target.includes("/") && !target.startsWith(".") && !target.endsWith(".md"))
    ) continue;
    const resolved =
      target.startsWith("docs/") || target.startsWith("acorn/")
        ? target
        : path.resolve(path.dirname(file), target);
    if (!fs.existsSync(resolved)) {
      fail(`${file} references missing markdown link target ${target}`);
    }
  }
}

if (failed) process.exit(1);
console.log("docs consistency OK");
