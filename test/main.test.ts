import { describe, expect, it } from 'vitest';
import { MARKER } from '../src/comment.js';
import { ConfigError } from '../src/config.js';
import type { ActionInputs } from '../src/inputs.js';
import { runAction, type ActionEnv } from '../src/main.js';
import { FakeGitHubApi, type Scenario } from './helpers/fake-api.js';
import { loadScenario, makeLogger, type RecordingLogger } from './helpers/factories.js';

interface Harness {
  env: ActionEnv;
  api: FakeGitHubApi;
  log: RecordingLogger;
  outputs: Record<string, string>;
  summaries: string[];
  failures: string[];
}

function harness(
  scenario: Scenario,
  inputs: Partial<ActionInputs> = {},
  overrides: Partial<ActionEnv> = {},
): Harness {
  const api = new FakeGitHubApi(scenario);
  const log = makeLogger();
  const outputs: Record<string, string> = {};
  const summaries: string[] = [];
  const failures: string[] = [];
  const env: ActionEnv = {
    inputs: {
      githubToken: 'test-token',
      configPath: '.github/pr-checkup.yml',
      label: 'needs-author-attention',
      failOnIssues: false,
      dryRun: false,
      ...inputs,
    },
    eventName: scenario.eventName,
    prNumber: scenario.pull.number,
    repo: scenario.repo,
    api,
    log,
    now: new Date(scenario.now),
    writeSummary: async (markdown) => {
      summaries.push(markdown);
    },
    setOutput: (name, value) => {
      outputs[name] = value;
    },
    setFailed: (message) => {
      failures.push(message);
    },
    ...overrides,
  };
  return { env, api, log, outputs, summaries, failures };
}

describe('runAction: needs attention', () => {
  it('posts one welcoming comment, adds the label and reports outputs', async () => {
    const h = harness(loadScenario('needs-attention'));
    const result = await runAction(h.env);

    expect(result.outcome).toBe('needs-attention');
    expect(result.commentAction).toBe('created');
    expect(result.labelAction).toBe('added');
    expect(result.commentBody?.startsWith(MARKER)).toBe(true);
    expect(result.commentBody).toContain('Welcome, @eager-newcomer');
    expect(h.api.writes.map((w) => w.method)).toEqual(['createComment', 'createLabel', 'addLabel']);
    expect(h.outputs).toEqual({
      result: 'needs-attention',
      'failed-checks': 'linked-issue,template-filled,description,tests-included,unrelated-files',
    });
    expect(h.summaries).toHaveLength(1);
    expect(h.summaries[0]).toContain('## pr-checkup: PR #101');
    expect(h.failures).toEqual([]);
  });

  it('is idempotent: a second run changes nothing', async () => {
    const h = harness(loadScenario('needs-attention'));
    await runAction(h.env);
    const writesAfterFirstRun = h.api.writes.length;
    const second = await runAction(h.env);
    expect(second.commentAction).toBe('unchanged');
    expect(second.labelAction).toBe('unchanged');
    expect(h.api.writes).toHaveLength(writesAfterFirstRun);
  });

  it('marks the run as failed when fail-on-issues is true', async () => {
    const h = harness(loadScenario('needs-attention'), { failOnIssues: true });
    await runAction(h.env);
    expect(h.failures).toHaveLength(1);
    expect(h.failures[0]).toBe(
      'pr-checkup found 5 thing(s) for the author to look at: linked-issue, template-filled, description, tests-included, unrelated-files.',
    );
  });

  it('skips labeling when the label input is empty', async () => {
    const h = harness(loadScenario('needs-attention'), { label: '' });
    const result = await runAction(h.env);
    expect(result.labelAction).toBe('disabled');
    expect(h.api.writes.map((w) => w.method)).toEqual(['createComment']);
  });
});

describe('runAction: all good', () => {
  it('updates the earlier comment to "all good" and removes the label', async () => {
    const h = harness(loadScenario('all-good'));
    const result = await runAction(h.env);
    expect(result.outcome).toBe('pass');
    expect(result.commentAction).toBe('updated');
    expect(result.labelAction).toBe('removed');
    expect(h.api.comments.find((c) => c.id === 555)?.body).toContain('Everything looks good.');
    expect(h.api.pull.labels).toEqual([]);
    expect(h.outputs).toEqual({ result: 'pass', 'failed-checks': '' });
  });

  it('does not post a new comment on a passing PR by default', async () => {
    const scenario = loadScenario('all-good');
    scenario.comments = [];
    scenario.pull.labels = [];
    const h = harness(scenario);
    const result = await runAction(h.env);
    expect(result.commentAction).toBe('skipped');
    expect(h.api.writes).toEqual([]);
  });

  it('posts an "all good" comment when post_when_passing is true', async () => {
    const scenario = loadScenario('all-good');
    scenario.comments = [];
    scenario.contents['main:.github/pr-checkup.yml'] = 'comment:\n  post_when_passing: true\n';
    const h = harness(scenario);
    const result = await runAction(h.env);
    expect(result.commentAction).toBe('created');
  });

  it('reads the config from the base branch using the config-path input', async () => {
    const scenario = loadScenario('all-good');
    scenario.contents['main:.github/custom.yml'] = 'checks:\n  linked-issue:\n    enabled: false\n';
    const h = harness(scenario, { configPath: '.github/custom.yml' });
    const result = await runAction(h.env);
    expect(h.api.calls).toContainEqual({
      method: 'getFileContent',
      args: ['.github/custom.yml', 'main'],
    });
    expect(result.results.map((r) => r.id)).not.toContain('linked-issue');
  });
});

describe('runAction: dry run', () => {
  it('renders and logs the comment but never writes to GitHub or fails the run', async () => {
    const h = harness(loadScenario('needs-attention'), { dryRun: true, failOnIssues: true });
    const result = await runAction(h.env);
    expect(result.commentAction).toBe('dry-run');
    expect(result.labelAction).toBe('dry-run');
    expect(h.api.writes).toEqual([]);
    expect(h.failures).toEqual([]);
    expect(h.log.lines.some((line) => line.startsWith('info: [dry-run] Rendered comment:'))).toBe(
      true,
    );
    expect(
      h.log.lines.some((line) => line.includes('[dry-run] Would mark this run as failed')),
    ).toBe(true);
    expect(h.summaries[0]).toContain('(dry run)');
  });
});

describe('runAction: skip rules', () => {
  it.each<[string, (s: Scenario) => void, string]>([
    ['drafts', (s) => (s.pull.draft = true), 'the pull request is a draft'],
    ['bots', (s) => (s.pull.authorType = 'Bot'), 'the author (eager-newcomer) is a bot'],
    [
      'members',
      (s) => (s.pull.authorAssociation = 'MEMBER'),
      "the author's association with the repository is MEMBER",
    ],
    [
      'allow-listed authors',
      (s) => (s.contents['main:.github/pr-checkup.yml'] = 'skip:\n  authors: [eager-newcomer]\n'),
      'the author (eager-newcomer) is listed in skip.authors',
    ],
    ['closed PRs', (s) => (s.pull.state = 'closed'), 'the pull request is not open'],
  ])('skips %s without fetching files or writing anything', async (_name, mutate, reason) => {
    const scenario = loadScenario('needs-attention');
    mutate(scenario);
    const h = harness(scenario);
    const result = await runAction(h.env);
    expect(result).toMatchObject({
      outcome: 'skipped',
      reason,
      commentAction: null,
      labelAction: null,
    });
    expect(h.api.calls.some((call) => call.method === 'listPullFiles')).toBe(false);
    expect(h.api.writes).toEqual([]);
    expect(h.summaries[0]).toBe(`## pr-checkup: PR #101\n\nSkipped because ${reason}.\n`);
    expect(h.outputs).toEqual({ result: 'skipped', 'failed-checks': '' });
  });

  it('ignores events that are not pull requests', async () => {
    const h = harness(
      loadScenario('needs-attention'),
      {},
      { eventName: 'push', prNumber: undefined },
    );
    const result = await runAction(h.env);
    expect(result.outcome).toBe('ignored');
    expect(h.api.calls).toEqual([]);
    expect(h.log.lines.some((line) => line.startsWith('warning: pr-checkup only runs on'))).toBe(
      true,
    );
    expect(h.outputs).toEqual({ result: 'skipped', 'failed-checks': '' });
  });
});

describe('runAction: errors', () => {
  it('rejects with a ConfigError when the config file is invalid', async () => {
    const scenario = loadScenario('needs-attention');
    scenario.contents['main:.github/pr-checkup.yml'] = 'checks:\n  nope: {}\n';
    const h = harness(scenario);
    await expect(runAction(h.env)).rejects.toBeInstanceOf(ConfigError);
    expect(h.api.writes).toEqual([]);
  });
});
