import assert from "node:assert/strict";
import test from "node:test";

import {
  renderGuideHtml,
  getGuides,
  GUIDES,
  classifyGuide,
} from "../src/git-guide.mts";
import {
  renderGlossaryHtml,
  getGlossaryTerms,
  getScenarios,
  TERMS,
  SCENARIOS,
  getLiveTermExample,
} from "../src/glossary-view.mts";
import { renderKnowledgeCenter } from "../src/workspace-views.mts";
import { glossary as koGlossary } from "../src/locales/ko/glossary.mts";
import { glossary as enGlossary } from "../src/locales/en/glossary.mts";
import { guide as koGuide } from "../src/locales/ko/guide.mts";
import { guide as enGuide } from "../src/locales/en/guide.mts";

test("locale dictionaries: ko and en glossary and guide dictionary keys match 100%", () => {
  function getDeepKeys(obj, prefix = "") {
    return Object.keys(obj).flatMap((key) => {
      const fullPath = prefix ? `${prefix}.${key}` : key;
      if (obj[key] && typeof obj[key] === "object" && !Array.isArray(obj[key])) {
        return getDeepKeys(obj[key], fullPath);
      }
      return [fullPath];
    });
  }

  const koGlossaryKeys = getDeepKeys(koGlossary).sort();
  const enGlossaryKeys = getDeepKeys(enGlossary).sort();
  assert.deepEqual(koGlossaryKeys, enGlossaryKeys, "All glossary keys must exist in both ko and en");

  const koGuideKeys = getDeepKeys(koGuide).sort();
  const enGuideKeys = getDeepKeys(enGuide).sort();
  assert.deepEqual(koGuideKeys, enGuideKeys, "All guide keys must exist in both ko and en");
});

test("glossary terms render in Korean and English", () => {
  // Korean
  const koHtml = renderGlossaryHtml({ locale: "ko" });
  assert.match(koHtml, /<html lang="ko">/);
  assert.match(koHtml, /Git 용어 설명/);
  assert.match(koHtml, /파일 수정을 내 로컬 Git 기록에 저장해요/);
  assert.match(koHtml, /원격 저장소는 아직 안 바뀌어요/);
  assert.match(koHtml, /작업 파일/);
  assert.match(koHtml, /내 로컬/);
  assert.match(koHtml, />예시<\/span>/);
  assert.match(koHtml, /원격/);
  assert.match(koHtml, /로컬/);

  // English
  const enHtml = renderGlossaryHtml({ locale: "en" });
  assert.match(enHtml, /<html lang="en">/);
  assert.match(enHtml, /Git Terminology Guide/);
  assert.match(enHtml, /Save file changes to your local Git history/);
  assert.match(enHtml, /The remote repository is not changed yet/);
  assert.match(enHtml, /Working files/);
  assert.match(enHtml, /Local Git/);
  assert.match(enHtml, />Example<\/span>/);
  assert.match(enHtml, />Remote<\/span>/);
  assert.match(enHtml, />Local<\/span>/);
});

test("situational Git guides render in Korean and English", () => {
  // Korean
  const koHtml = renderGuideHtml("dirty-pull", { locale: "ko" });
  assert.match(koHtml, /<html lang="ko">/);
  assert.match(koHtml, /상황별 Git 가이드/);
  assert.match(koHtml, /작업 중인데 Pull 해야 해요/);
  assert.match(koHtml, /내 로컬 변경과 원격 변경이 부딪힐 수 있어서/);
  assert.match(koHtml, /<strong>피할 것<\/strong>/);
  assert.match(koHtml, /지금 변경이 커밋 가능한 상태면 먼저 Commit해요/);
  // Marker conflict
  assert.match(koHtml, /내 변경/);
  assert.match(koHtml, /서버에서 들어온 변경/);
  assert.match(koHtml, /내 변경 사용/);

  // English
  const enHtml = renderGuideHtml("dirty-pull", { locale: "en" });
  assert.match(enHtml, /<html lang="en">/);
  assert.match(enHtml, /Situational Git Guides/);
  assert.match(enHtml, /Need to pull while having uncommitted changes/);
  assert.match(enHtml, /Pulling immediately may cause conflicts/);
  assert.match(enHtml, /<strong>Avoid<\/strong>/);
  assert.match(enHtml, /If current changes are ready, commit them first/);
  // Marker conflict
  assert.match(enHtml, /Current changes/);
  assert.match(enHtml, /Incoming changes from server/);
  assert.match(enHtml, /Accept Current/);
  assert.match(enHtml, /&lt;&lt;&lt;&lt;&lt;&lt;&lt; HEAD/);
});

test("learning center workspace renders in Korean and English", () => {
  const state = {
    kind: "repository",
    branch: "main",
    head: "1234567890abcdef",
    upstream: "origin/main",
    tracking: { kind: "diverged", ahead: 2, behind: 3 },
    changes: [],
  };

  // Korean
  const koHtml = renderKnowledgeCenter({ tab: "guides", state }, { locale: "ko" });
  assert.match(koHtml, /<html lang="ko">/);
  assert.match(koHtml, /Git 도움말/);
  assert.match(koHtml, /상황별 가이드/);
  assert.match(koHtml, /상황별 시나리오/);
  assert.match(koHtml, /현재 저장소와 비슷해요/);
  assert.match(koHtml, /로컬과 원격이 갈라짐/);
  assert.match(koHtml, /<strong>상태<\/strong>/);
  assert.match(koHtml, /<strong>위험<\/strong>/);
  assert.match(koHtml, /<strong>다음 행동<\/strong>/);
  assert.match(koHtml, /양쪽에 서로 다른 새 커밋이 있어요/);

  // English
  const enHtml = renderKnowledgeCenter({ tab: "guides", state }, { locale: "en" });
  assert.match(enHtml, /<html lang="en">/);
  assert.match(enHtml, /Git Help &amp; Learning Center/);
  assert.match(enHtml, /Situational Guides/);
  assert.match(enHtml, /Situational Scenarios/);
  assert.match(enHtml, /Similar to current repository/);
  assert.match(enHtml, /Local and remote diverged/);
  assert.match(enHtml, /<strong>State<\/strong>/);
  assert.match(enHtml, /<strong>Risk<\/strong>/);
  assert.match(enHtml, /<strong>Next action<\/strong>/);
  assert.match(enHtml, /New distinct commits exist on both sides/);
});

test("guide and scenario IDs remain stable across locales", () => {
  const koGuides = getGuides("ko");
  const enGuides = getGuides("en");
  assert.deepEqual(Object.keys(koGuides).sort(), Object.keys(enGuides).sort());

  const koScenarios = getScenarios("ko");
  const enScenarios = getScenarios("en");
  assert.deepEqual(
    koScenarios.map((s) => s.id),
    enScenarios.map((s) => s.id),
  );

  // Guide classification remains stable
  assert.equal(classifyGuide({ action: "pull", code: "dirty-working-tree" }), "dirty-pull");
  assert.equal(classifyGuide({ action: "pull", code: "pull-conflict" }), "pull-conflict");
  assert.equal(classifyGuide({ action: "push", detail: "rejected non-fast-forward" }), "push-rejected");
  assert.equal(classifyGuide({ action: "push", code: "diverged" }), "diverged");
});

test("live term examples render in Korean and English", () => {
  const state = {
    kind: "repository",
    branch: "main",
    head: "abcdef1234567890",
    upstream: "origin/main",
    tracking: { kind: "ahead", ahead: 2, behind: 0 },
  };

  const koLive = getLiveTermExample("Push", state, { locale: "ko" });
  assert.match(koLive, /현재 origin\/main로 보낼 커밋 2개/);

  const enLive = getLiveTermExample("Push", state, { locale: "en" });
  assert.match(enLive, /2 commit\(s\) to push to origin\/main/);
});

test("educational animation presets and reduced-motion immunity are preserved", () => {
  const koHtml = renderGlossaryHtml({ locale: "ko" });
  const enHtml = renderGlossaryHtml({ locale: "en" });

  for (const html of [koHtml, enHtml]) {
    assert.doesNotMatch(html, /prefers-reduced-motion/);
    for (const animation of [
      "commit", "push", "pull", "fetch", "branch", "head",
      "detached", "merge", "conflict", "rebase", "stash",
      "cherry-pick", "revert", "reset", "tag", "upstream",
      "ahead-behind", "diverged", "force-push",
    ]) {
      assert.match(html, new RegExp(`semantic-${animation}`));
    }
  }
});
