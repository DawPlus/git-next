import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const require=createRequire(import.meta.url);
const {createWebviewMessageHandler}=require('../src/webview-message-handler.ts');
test('Fetch progress wraps network failure, shows retry guidance, and clears pending for another attempt',async t=>{
 const cwd=mkdtempSync(join(tmpdir(),'git-next-fetch-'));t.after(()=>rmSync(cwd,{recursive:true,force:true}));
 const git=(...args)=>execFileSync('git',args,{cwd,stdio:'ignore'});
 git('init','-b','main');git('remote','add','origin',join(cwd,'missing-remote'));
 const events=[],notices=[];let progress=0,active=false;
 const handle=createWebviewMessageHandler({
  vscode:{ProgressLocation:{Notification:1},window:{withProgress:async(options,fn)=>{assert.equal(options.cancellable,false);progress++;active=true;try{return await fn();}finally{active=false;}}}},
  host:{webview:{postMessage:async e=>events.push(e)}},getCwd:()=>cwd,getOptions:()=>({}),
  t:key=>key,renderPanel:async(_host,notice)=>{assert.equal(active,false);notices.push(notice);},
 });
 await handle({type:'refresh'});await handle({type:'refresh'});
 assert.equal(progress,2);assert.equal(notices.length,2);assert.equal(notices[0].code,'fetch-failed');
 assert.match(notices[0].detail,/retryFetch/);
 assert.deepEqual(events.map(e=>e.pending),[true,false,true,false]);
});
