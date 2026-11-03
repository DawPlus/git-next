import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { withRepositoryOperation, repositoryFingerprint, inspectRepositoryLock } from '../src/repository-operation.mts';
const git = (cwd,...args) => execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
function fixture(t) {
 const cwd=mkdtempSync(join(tmpdir(),'git-next-operation-')); t.after(()=>rmSync(cwd,{recursive:true,force:true}));
 git(cwd,'init','-b','main'); git(cwd,'config','user.name','QA'); git(cwd,'config','user.email','qa@example.invalid'); return cwd;
}
test('common Git directory lock rejects other processes, permits nesting, releases after errors',async t=>{
 const cwd=fixture(t); writeFileSync(join(cwd,'a'),'base'); git(cwd,'add','.'); git(cwd,'commit','-m','base');
 const worktree=cwd+'-linked'; git(cwd,'worktree','add','-b','linked',worktree); t.after(()=>rmSync(worktree,{recursive:true,force:true}));
 await assert.rejects(withRepositoryOperation(cwd,async()=>{
  assert.equal(await withRepositoryOperation(cwd,async()=>42),42);
  const script=`import {withRepositoryOperation} from ${JSON.stringify(resolve('src/repository-operation.mts'))}; try {await withRepositoryOperation(${JSON.stringify(worktree)},async()=>{}); process.exitCode=2;} catch(e){process.exitCode=e.code==='repository-busy'?0:3;}`;
  const child=spawn(process.execPath,['--import','tsx','--input-type=module','-e',script],{stdio:'pipe'});
  assert.equal((await once(child,'exit'))[0],0); throw new Error('fixture failure');
 }),/fixture failure/);
 assert.equal(await withRepositoryOperation(cwd,async()=>7),7);
});
test('lock inspection reports owner without stealing or deleting the lock', async t => {
 const cwd = fixture(t);
 const lockPath = join(cwd,'.git','git-next-operation.lock');
 writeFileSync(lockPath, JSON.stringify({ pid: process.pid, startedAt: '2026-11-03T00:00:00.000Z' }));
 const info = await inspectRepositoryLock(lockPath);
 assert.equal(info.pid, process.pid);
 assert.equal(info.processStatus, 'running');
 await assert.rejects(withRepositoryOperation(cwd, async () => {}), error => {
  assert.equal(error.code, 'repository-busy');
  assert.equal(error.lockInfo.processStatus, 'running');
  return true;
 });
 assert.equal(await inspectRepositoryLock(lockPath).then(info => info.pid), process.pid);
});
test('fingerprint detects unborn index content, branch and stash changes',async t=>{
 const cwd=fixture(t); const empty=await repositoryFingerprint(cwd); assert.ok(empty);
 writeFileSync(join(cwd,'a'),'one'); git(cwd,'add','.'); const first=await repositoryFingerprint(cwd); assert.notEqual(first,empty);
 writeFileSync(join(cwd,'a'),'two'); git(cwd,'add','.'); assert.notEqual(await repositoryFingerprint(cwd),first);
 git(cwd,'commit','-m','base'); const committed=await repositoryFingerprint(cwd); git(cwd,'switch','-c','other'); assert.notEqual(await repositoryFingerprint(cwd),committed);
 writeFileSync(join(cwd,'a'),'work'); git(cwd,'stash','push'); const saved=await repositoryFingerprint(cwd); git(cwd,'stash','drop'); assert.notEqual(await repositoryFingerprint(cwd),saved);
});
