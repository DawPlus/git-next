import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as actions from '../src/git-actions.mts';
import { recommendNextAction } from '../src/git-diagnostics.mts';
import { rememberStashForPull, getStashFlow, markStashPulled } from '../src/stash-flow.mts';
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

async function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'git-next-stash-flow-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  git(cwd, 'init', '-b', 'main'); git(cwd, 'config', 'user.name', 'Test'); git(cwd, 'config', 'user.email', 'test@example.com');
  writeFileSync(join(cwd, 'a.txt'), 'base\n'); git(cwd, 'add', '.'); git(cwd, 'commit', '-m', 'base');
  writeFileSync(join(cwd, 'a.txt'), 'work\n');
  const saved = await actions.stashPush(cwd, 'before Pull');
  await rememberStashForPull(cwd, saved.stashCommit);
  return cwd;
}

test('guided stash survives renumbering, restores by identity, and clears after Pop', async t => {
  const cwd = await fixture(t);
  const original = await getStashFlow(cwd);
  assert.equal(original.phase, 'pull');
  writeFileSync(join(cwd, 'other.txt'), 'other');
  await actions.stashPush(cwd, 'unrelated');
  await markStashPulled(cwd);
  const flow = await getStashFlow(cwd);
  assert.equal(flow.ref, 'stash@{1}'); assert.equal(flow.commit, original.commit);
  assert.equal(recommendNextAction({ stashFlow: flow, tracking: { kind: 'up-to-date' } }).kind, 'stash-restore');
  assert.equal((await actions.stashPop(cwd, flow.ref)).ok, true);
  assert.equal(await getStashFlow(cwd), null);
  assert.equal((await actions.listStashes(cwd)).length, 1);
});

test('Apply suggests cleanup; branch changes and failed operations never remove the saved work', async t => {
  const cwd = await fixture(t);
  git(cwd, 'switch', '-c', 'other'); assert.equal(await getStashFlow(cwd), null);
  await markStashPulled(cwd);
  git(cwd, 'switch', 'main'); assert.equal((await getStashFlow(cwd)).phase, 'pull');
  await markStashPulled(cwd);
  assert.equal((await actions.stashApply(cwd, 'stash@{0}')).ok, true);
  const flow = await getStashFlow(cwd);
  assert.equal(recommendNextAction({ stashFlow: flow, changes: [{ status: ' M', path: 'a.txt' }] }).kind, 'stash-cleanup');
  assert.equal((await actions.stashDrop(cwd, flow.ref)).ok, true);
  assert.equal(await getStashFlow(cwd), null);
});

test('Pop conflict recommends resolving before offering cleanup', async t => {
  const cwd = await fixture(t); await markStashPulled(cwd);
  writeFileSync(join(cwd, 'a.txt'), 'upstream\n'); git(cwd, 'commit', '-am', 'incoming');
  assert.equal((await actions.stashPop(cwd, 'stash@{0}')).ok, false);
  const flow = await getStashFlow(cwd);
  assert.equal(flow.phase, 'conflict');
  assert.equal(recommendNextAction({ stashFlow: flow, changes: [{ status: 'UU', path: 'a.txt' }] }).kind, 'stash-conflict');
  assert.equal(recommendNextAction({ stashFlow: flow, changes: [{ status: 'M ', path: 'a.txt' }] }).kind, 'stash-cleanup');
  assert.equal((await actions.listStashes(cwd)).length, 1);
});

test('a changed stash reference blocks deletion instead of dropping another item', async t => {
  const cwd = await fixture(t);
  const original = await getStashFlow(cwd);
  writeFileSync(join(cwd, 'other.txt'), 'keep'); await actions.stashPush(cwd, 'other');
  const result = await actions.stashDrop(cwd, 'stash@{0}', original.commit);
  assert.equal(result.ok, false); assert.equal(result.code, 'stash-changed');
  assert.equal((await actions.listStashes(cwd)).length, 2);
});

test('successful Pull advances the guided stash, failed Pull does not', async t => {
  const cwd = await fixture(t);
  assert.equal((await actions.pullRepository(cwd)).ok, false);
  assert.equal((await getStashFlow(cwd)).phase, 'pull');
  const remote = mkdtempSync(join(tmpdir(), 'git-next-stash-remote-'));
  t.after(() => rmSync(remote, { recursive: true, force: true }));
  git(remote, 'init', '--bare'); git(cwd, 'remote', 'add', 'origin', remote); git(cwd, 'push', '-u', 'origin', 'main');
  assert.equal((await actions.pullRepository(cwd)).ok, true);
  assert.equal((await getStashFlow(cwd)).phase, 'restore');
});

test('sidebar offers save, Pop, cleanup and conflict actions', async () => {
  const { renderSidebarHtml } = await import('../src/sidebar-view.mts');
  const entries = [['pull-blocked-dirty', 'stashBeforePull'], ['stash-restore', 'stashRestore'], ['stash-cleanup', 'stashCleanup'], ['stash-conflict', 'operationRecovery']];
  for (const [kind, action] of entries) {
    const html = renderSidebarHtml({ branch: 'main', refs: [], changes: [], nextAction: { kind, stashId: 'abc', title: 'test' } });
    assert.match(html, new RegExp(`class="guard-next-action"[^>]*data-action="${action}"[^>]*data-stash-id="abc"`));
  }
});

test('stash recommendations survive reload and remove persisted state after Drop', async t => {
  const { configureStashFlowStorage } = await import('../src/stash-flow.mts');
  let saved = {};
  const storage = { get: () => structuredClone(saved), update: async (_, value) => { saved = structuredClone(value); } };
  configureStashFlowStorage(storage);
  const cwd = await fixture(t); await markStashPulled(cwd);
  const before = await getStashFlow(cwd);
  configureStashFlowStorage(storage);
  assert.deepEqual(await getStashFlow(cwd), before);
  await actions.stashDrop(cwd, before.ref);
  configureStashFlowStorage(storage);
  assert.equal(await getStashFlow(cwd), null);
  assert.deepEqual(saved, {});
  configureStashFlowStorage(null);
});
