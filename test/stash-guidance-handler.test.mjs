import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as actions from '../src/git-actions.mts';
import { getStashFlow, markStashPulled } from '../src/stash-flow.mts';
const require = createRequire(import.meta.url), Module = require('node:module');
const original = Module._load;
const vscode = { window: { showQuickPick: async items => items.find(item => item.id === 'default'), showInformationMessage: async () => {}, showWarningMessage: async () => {} } };
Module._load = function(name, ...args) { return name === 'vscode' ? vscode : original.call(this, name, ...args); };
const { createPanelHandlers } = require('../src/panel-handlers.ts');
Module._load = original;
const git = (cwd, ...args) => execFileSync('git', args, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();

test('recommendations execute Stash, Pop and Drop with confirmation; cancellation preserves the next step', async t => {
  const cwd = mkdtempSync(join(tmpdir(), 'git-next-stash-handler-'));
  t.after(() => rmSync(cwd, {recursive: true, force: true}));
  git(cwd, 'init', '-b', 'main'); git(cwd, 'config', 'user.name', 'Test'); git(cwd, 'config', 'user.email', 'test@example.com');
  writeFileSync(join(cwd, 'a'), 'base'); git(cwd, 'add', '.'); git(cwd, 'commit', '-m', 'base');
  writeFileSync(join(cwd, 'a'), 'my saved work');
  let created = true, confirmed = false, receive, html;
  const panel = { webview: { onDidReceiveMessage: callback => {receive = callback;} } };
  const handlers = createPanelHandlers({getCwd: () => cwd, refreshState: async () => {},
    getOrCreateWebviewPanel: () => {const value = {panel, created}; created = false; return value;},
    setWebviewHtml: (_, value) => {html = value;}, guardWorkingState: async () => ({ok:true}),
    confirmMutation: async () => confirmed,
  }, () => ({}));
  const context = {subscriptions: []};
  await handlers.openStashWorkspace(context, {intent:'before-pull'});
  assert.equal(await getStashFlow(cwd), null); assert.equal((await actions.listStashes(cwd)).length, 0);
  confirmed = true;
  await handlers.openStashWorkspace(context, {intent:'before-pull'});
  const saved = await getStashFlow(cwd); assert.equal(saved.phase, 'pull');
  await markStashPulled(cwd);
  writeFileSync(join(cwd, 'other'), 'other stash'); await actions.stashPush(cwd, 'unrelated');
  confirmed = false;
  await handlers.openStashWorkspace(context, {intent:'restore', stashId:saved.commit});
  assert.equal((await getStashFlow(cwd)).phase, 'restore');
  assert.equal((await actions.listStashes(cwd)).length, 2);
  assert.match(html, /stash@\{1\}/);
  confirmed = true;
  await handlers.openStashWorkspace(context, {intent:'restore', stashId:saved.commit});
  assert.equal(readFileSync(join(cwd, 'a'), 'utf8'), 'my saved work');
  assert.equal(await getStashFlow(cwd), null); assert.equal((await actions.listStashes(cwd)).length, 1);
  await handlers.openStashWorkspace(context, {intent:'before-pull'});
  await markStashPulled(cwd);
  const second = await getStashFlow(cwd);
  await handlers.openStashWorkspace(context, {stashId:second.commit});
  await receive({type:'apply', ref:second.ref});
  assert.equal((await getStashFlow(cwd)).phase, 'cleanup');
  confirmed = false;
  await handlers.openStashWorkspace(context, {intent:'cleanup', stashId:second.commit});
  assert.equal((await getStashFlow(cwd)).phase, 'cleanup');
  confirmed = true;
  await handlers.openStashWorkspace(context, {intent:'cleanup', stashId:second.commit});
  assert.equal(await getStashFlow(cwd), null); assert.equal((await actions.listStashes(cwd)).length, 1);
});
