import { getFixedT, getLocale, normalizeLocale } from "./i18n.mjs";

export interface TermDefinition {
  key: string;
  tone: string;
  animation: string;
}

export interface GlossaryTerm {
  term: string;
  ko: string;
  summary: string;
  effect: string;
  example: string;
  flow: [string, string];
  tone: string;
  animation: string;
}

export interface ScenarioDefinition {
  id: string;
  key: string;
  matches: (repo: any) => boolean;
}

export interface ScenarioItem {
  id: string;
  title: string;
  state: string;
  risk: string;
  next: string;
  matches: (repo: any) => boolean;
}

export const TERM_METADATA: readonly TermDefinition[] = [
  { key: "commit", tone: "local", animation: "commit" },
  { key: "push", tone: "remote", animation: "push" },
  { key: "pull", tone: "remote", animation: "pull" },
  { key: "fetch", tone: "remote", animation: "fetch" },
  { key: "branch", tone: "branch", animation: "branch" },
  { key: "head", tone: "local", animation: "head" },
  { key: "detachedHead", tone: "warning", animation: "detached" },
  { key: "merge", tone: "branch", animation: "merge" },
  { key: "conflict", tone: "warning", animation: "conflict" },
  { key: "rebase", tone: "warning", animation: "rebase" },
  { key: "stash", tone: "local", animation: "stash" },
  { key: "cherryPick", tone: "branch", animation: "cherry-pick" },
  { key: "revert", tone: "local", animation: "revert" },
  { key: "reset", tone: "danger", animation: "reset" },
  { key: "tag", tone: "local", animation: "tag" },
  { key: "upstream", tone: "remote", animation: "upstream" },
  { key: "aheadBehind", tone: "remote", animation: "ahead-behind" },
  { key: "diverged", tone: "warning", animation: "diverged" },
  { key: "forcePush", tone: "danger", animation: "force-push" },
  { key: "repository", tone: "local", animation: "commit" },
  { key: "workingTree", tone: "local", animation: "commit" },
  { key: "stagingArea", tone: "local", animation: "commit" },
  { key: "remote", tone: "remote", animation: "upstream" },
  { key: "origin", tone: "remote", animation: "upstream" },
  { key: "clone", tone: "remote", animation: "pull" },
  { key: "checkoutSwitch", tone: "branch", animation: "branch" },
  { key: "stashApplyPop", tone: "local", animation: "pull" },
] as const;

export const SCENARIO_DEFINITIONS: readonly ScenarioDefinition[] = [
  {
    id: "diverged",
    key: "diverged",
    matches: (repo: any) => repo?.tracking?.kind === "diverged",
  },
  {
    id: "push-rejected",
    key: "pushRejected",
    matches: (repo: any) => Number(repo?.tracking?.behind) > 0,
  },
  {
    id: "dirty-pull",
    key: "dirtyPull",
    matches: (repo: any) => Boolean(repo?.changes?.length) && Number(repo?.tracking?.behind) > 0,
  },
  {
    id: "gone-upstream",
    key: "goneUpstream",
    matches: (repo: any) => repo?.upstreamState?.kind === "remote-branch-missing",
  },
] as const;

export function getGlossaryTerms(localeCandidate?: string | null): GlossaryTerm[] {
  const locale = normalizeLocale(localeCandidate);
  const tFn = getFixedT(locale);
  return TERM_METADATA.map((meta) => ({
    term: tFn(`glossary.terms.${meta.key}.term`),
    ko: tFn(`glossary.terms.${meta.key}.subLabel`),
    summary: tFn(`glossary.terms.${meta.key}.summary`),
    effect: tFn(`glossary.terms.${meta.key}.effect`),
    example: tFn(`glossary.terms.${meta.key}.example`),
    flow: [
      tFn(`glossary.terms.${meta.key}.flowFrom`),
      tFn(`glossary.terms.${meta.key}.flowTo`),
    ],
    tone: meta.tone,
    animation: meta.animation,
  }));
}

export function getScenarios(localeCandidate?: string | null): ScenarioItem[] {
  const locale = normalizeLocale(localeCandidate);
  const tFn = getFixedT(locale);
  return SCENARIO_DEFINITIONS.map((def) => ({
    id: def.id,
    title: tFn(`glossary.scenarios.${def.key}.title`),
    state: tFn(`glossary.scenarios.${def.key}.state`),
    risk: tFn(`glossary.scenarios.${def.key}.risk`),
    next: tFn(`glossary.scenarios.${def.key}.next`),
    matches: def.matches,
  }));
}

export const TERMS: GlossaryTerm[] = new Proxy([] as unknown as GlossaryTerm[], {
  get(_target, prop: string | symbol) {
    const list = getGlossaryTerms(getLocale());
    if (prop === "length") return list.length;
    if (prop === Symbol.iterator) return list[Symbol.iterator].bind(list);
    const val = (list as any)[prop];
    return typeof val === "function" ? val.bind(list) : val;
  },
  ownKeys() {
    return Reflect.ownKeys(getGlossaryTerms(getLocale()));
  },
  getOwnPropertyDescriptor(_target, prop) {
    const list = getGlossaryTerms(getLocale());
    return Reflect.getOwnPropertyDescriptor(list, prop);
  },
});

export const SCENARIOS: ScenarioItem[] = new Proxy([] as unknown as ScenarioItem[], {
  get(_target, prop: string | symbol) {
    const list = getScenarios(getLocale());
    if (prop === "length") return list.length;
    if (prop === Symbol.iterator) return list[Symbol.iterator].bind(list);
    const val = (list as any)[prop];
    return typeof val === "function" ? val.bind(list) : val;
  },
  ownKeys() {
    return Reflect.ownKeys(getScenarios(getLocale()));
  },
  getOwnPropertyDescriptor(_target, prop) {
    const list = getScenarios(getLocale());
    return Reflect.getOwnPropertyDescriptor(list, prop);
  },
});
