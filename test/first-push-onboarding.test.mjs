import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderSidebarHtml } from '../src/sidebar-view.mts';
const require = createRequire(import.meta.url);
const Module = require('node:module');
let inputs = [], confirmed = [], result, notices = [], cancelAction = null, prompts = 0;
const vscode = { ProgressLocation: { Notification: 1 }, window: {
  showInputBox: async () => { prompts++; return inputs.shift(); },
  showQuickPick: async items => items[0],
  withProgress: async (_, action) => action(),
} };
const original = Module._load;
Module._load = function(name, ...args) { return name === 'vscode' ? vscode : original.call(this, name, ...args); };
const { createSyncHandler } = require('../src/sync-handler.ts');
Module._load = original;
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'git-next-onboarding-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const cwd = join(root, 'local'), remote = join(root, 'remote'); mkdirSync(cwd); mkdirSync(remote);
  git(cwd, 'init', '-b', 'feature/main'); git(cwd, 'config', 'user.name', 'Test'); git(cwd, 'config', 'user.email', 'test@example.com'); git(cwd, 'commit', '--allow-empty', '-m', 'first'); git(remote, 'init', '--bare');
  inputs = [remote, 'feature/main']; confirmed = []; notices = []; result = null; cancelAction = null; prompts = 0;
  const sync = createSyncHandler({ getCwd: () => cwd, getGuideKey: async () => null,
    renderPanel: async (_, notice) => notices.push(notice), refreshState: async () => {},
    confirmMutation: async request => {confirmed.push(request); return request.action !== cancelAction;},
    showResult: async (_h, _m, _o, value) => {result = value;},
  });
  return {cwd, remote, sync};
}

test('first Push registers a missing remote and continues to publish', async t => {
  const {cwd, remote, sync} = fixture(t);
  await sync.publishBranch(null, 'sidebar', {}, cwd, 'feature/main');
  assert.equal(result?.ok, true);
  assert.equal(git(cwd, 'remote', 'get-url', 'origin'), remote);
  assert.equal(git(remote, 'rev-parse', 'refs/heads/feature/main'), git(cwd, 'rev-parse', 'HEAD'));
});

test('cancelling remote entry leaves first Push available without mutating the repository', async t => {
  const {cwd, sync} = fixture(t); inputs = [undefined];
  await sync.publishBranch(null, 'sidebar', {}, cwd, 'feature/main');
  assert.equal(prompts, 1); assert.equal(git(cwd, 'remote'), '');
  assert.equal(result, null); assert.equal(notices.length, 0);
});

test('cancelling final publish keeps the configured remote and leaves branch unpublished', async t => {
  const {cwd, remote, sync} = fixture(t); cancelAction = '첫 Push 설정';
  await sync.publishBranch(null, 'sidebar', {}, cwd, 'feature/main');
  assert.equal(git(cwd, 'remote', 'get-url', 'origin'), remote);
  assert.equal(git(remote, 'for-each-ref', 'refs/heads'), '');
  assert.equal(result, null);
});

test('an empty repository offers creating the first file rather than Push', () => {
  const html = renderSidebarHtml({branch: 'main', head: null, refs: [], changes: [], nextAction: {kind: 'initial-commit', title: 'First commit'}});
  assert.match(html, /class="guard-next-action"[^>]*data-action="createFirstFile"/);
});
