import { describe, expect, it } from 'vitest';
import { buildPrContext, findTemplate, MAX_FILES, sinceIso } from '../src/context.js';
import { FakeGitHubApi } from './helpers/fake-api.js';
import { defaultConfig, loadScenario, makeLogger } from './helpers/factories.js';

const REPO = { owner: 'octo-org', repo: 'widgets' };
const NOW = new Date('2026-10-17T12:00:00Z');

describe('buildPrContext', () => {
  it('collects the PR data, files and template from the base branch', async () => {
    const scenario = loadScenario('needs-attention');
    const api = new FakeGitHubApi(scenario);
    const ctx = await buildPrContext(api, scenario.pull, REPO, defaultConfig(), NOW, makeLogger());
    expect(ctx).toMatchObject({
      owner: 'octo-org',
      repo: 'widgets',
      number: 101,
      title: 'Update stuff',
      authorLogin: 'eager-newcomer',
      authorAssociation: 'FIRST_TIME_CONTRIBUTOR',
      filesTruncated: false,
      recentPrCount: null,
    });
    expect(ctx.files).toHaveLength(3);
    expect(ctx.template).toContain('## What does this PR do?');
    expect(api.calls).toContainEqual({ method: 'listPullFiles', args: [101, MAX_FILES] });
    expect(api.calls).toContainEqual({
      method: 'getFileContent',
      args: ['.github/pull_request_template.md', 'main'],
    });
  });

  it('marks the file list as truncated when GitHub reports more files', async () => {
    const scenario = loadScenario('needs-attention');
    scenario.pull.changedFiles = 3500;
    const api = new FakeGitHubApi(scenario);
    const ctx = await buildPrContext(api, scenario.pull, REPO, defaultConfig(), NOW, makeLogger());
    expect(ctx.filesTruncated).toBe(true);
  });

  it('skips the template lookup when no check needs it', async () => {
    const scenario = loadScenario('needs-attention');
    const config = defaultConfig();
    config.checks['template-filled'].enabled = false;
    config.checks.description.enabled = false;
    const api = new FakeGitHubApi(scenario);
    const ctx = await buildPrContext(api, scenario.pull, REPO, config, NOW, makeLogger());
    expect(ctx.template).toBeNull();
    expect(api.calls.some((call) => call.method === 'getFileContent')).toBe(false);
  });

  it('only calls the search API when pr-burst is enabled', async () => {
    const scenario = loadScenario('needs-attention');
    scenario.recentPrCount = 14;
    const config = defaultConfig();

    const quiet = new FakeGitHubApi(scenario);
    await buildPrContext(quiet, scenario.pull, REPO, config, NOW, makeLogger());
    expect(quiet.calls.some((call) => call.method === 'countRecentPullRequests')).toBe(false);

    config.checks['pr-burst'].enabled = true;
    const busy = new FakeGitHubApi(scenario);
    const ctx = await buildPrContext(busy, scenario.pull, REPO, config, NOW, makeLogger());
    expect(ctx.recentPrCount).toBe(14);
    expect(busy.calls).toContainEqual({
      method: 'countRecentPullRequests',
      args: ['eager-newcomer', '2026-10-16T12:00:00Z'],
    });
  });

  it('logs a warning and leaves the count empty when the search fails', async () => {
    const scenario = loadScenario('needs-attention');
    const config = defaultConfig();
    config.checks['pr-burst'].enabled = true;
    const api = new FakeGitHubApi(scenario);
    api.searchError = new Error('rate limited');
    const log = makeLogger();
    const ctx = await buildPrContext(api, scenario.pull, REPO, config, NOW, log);
    expect(ctx.recentPrCount).toBeNull();
    expect(
      log.lines.some((line) => line.startsWith('warning:') && line.includes('rate limited')),
    ).toBe(true);
  });
});

describe('findTemplate', () => {
  it('returns the first template path that exists', async () => {
    const scenario = loadScenario('needs-attention');
    scenario.contents = { 'main:docs/PULL_REQUEST_TEMPLATE.md': 'docs template' };
    const api = new FakeGitHubApi(scenario);
    const paths = defaultConfig().checks['template-filled'].template_paths;
    expect(await findTemplate(api, paths, 'main')).toBe('docs template');
  });

  it('returns null when there is no template', async () => {
    const scenario = loadScenario('needs-attention');
    scenario.contents = {};
    const api = new FakeGitHubApi(scenario);
    expect(await findTemplate(api, ['a.md', 'b.md'], 'main')).toBeNull();
  });
});

describe('sinceIso', () => {
  it('subtracts the window and drops milliseconds', () => {
    expect(sinceIso(new Date('2026-10-17T12:00:00.123Z'), 24)).toBe('2026-10-16T12:00:00Z');
  });
});
