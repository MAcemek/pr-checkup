import { readFileSync } from 'node:fs';
import { DEFAULT_CONFIG, type ChecksConfig, type Config } from '../../src/config.js';
import type { CheckId, Logger, PrContext, PrFile, PullRequestData } from '../../src/types.js';
import type { Scenario } from './fake-api.js';

export function makeFile(filename: string, overrides: Partial<PrFile> = {}): PrFile {
  return { filename, status: 'modified', additions: 1, deletions: 0, changes: 1, ...overrides };
}

export function makeContext(overrides: Partial<PrContext> = {}): PrContext {
  return {
    owner: 'octo-org',
    repo: 'widgets',
    number: 42,
    title: 'Add retry to the HTTP client',
    body: 'Fixes #12\n\nRetries failed requests up to three times with exponential backoff.',
    authorLogin: 'new-contributor',
    authorAssociation: 'CONTRIBUTOR',
    additions: 10,
    deletions: 2,
    changedFiles: 2,
    files: [makeFile('src/http.ts'), makeFile('test/http.test.ts')],
    filesTruncated: false,
    template: null,
    recentPrCount: null,
    ...overrides,
  };
}

export function makePull(overrides: Partial<PullRequestData> = {}): PullRequestData {
  return {
    number: 42,
    title: 'Add retry to the HTTP client',
    body: 'Fixes #12\n\nRetries failed requests up to three times with exponential backoff.',
    state: 'open',
    draft: false,
    authorLogin: 'new-contributor',
    authorType: 'User',
    authorAssociation: 'CONTRIBUTOR',
    baseRef: 'main',
    baseSha: 'base000',
    headSha: 'head000',
    additions: 10,
    deletions: 2,
    changedFiles: 2,
    labels: [],
    ...overrides,
  };
}

export function checkConfig<K extends CheckId>(
  id: K,
  overrides: Partial<ChecksConfig[K]> = {},
): ChecksConfig[K] {
  return { ...structuredClone(DEFAULT_CONFIG.checks[id]), ...overrides };
}

export function defaultConfig(): Config {
  return structuredClone(DEFAULT_CONFIG);
}

export interface RecordingLogger extends Logger {
  lines: string[];
}

export function makeLogger(): RecordingLogger {
  const lines: string[] = [];
  return {
    lines,
    info: (message) => lines.push(`info: ${message}`),
    warning: (message) => lines.push(`warning: ${message}`),
    debug: (message) => lines.push(`debug: ${message}`),
  };
}

export function loadScenario(name: string): Scenario {
  const url = new URL(`../fixtures/scenarios/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as Scenario;
}

export function readFixture(name: string): string {
  return readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
}
