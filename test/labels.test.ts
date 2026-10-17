import { describe, expect, it } from 'vitest';
import { LABEL_COLOR, LABEL_DESCRIPTION, syncLabel } from '../src/labels.js';
import { FakeGitHubApi } from './helpers/fake-api.js';
import { loadScenario, makeLogger } from './helpers/factories.js';

const NAME = 'needs-author-attention';

function setup(repoLabels: string[], prLabels: string[]): FakeGitHubApi {
  const scenario = loadScenario('needs-attention');
  scenario.repoLabels = repoLabels;
  scenario.pull.labels = prLabels;
  return new FakeGitHubApi(scenario);
}

describe('syncLabel', () => {
  it('does nothing when labeling is disabled', async () => {
    const api = setup([], []);
    const action = await syncLabel(api, 101, {
      name: '',
      shouldHave: true,
      currentLabels: [],
      dryRun: false,
      log: makeLogger(),
    });
    expect(action).toBe('disabled');
    expect(api.calls).toEqual([]);
  });

  it('creates the label in the repository if needed, then adds it', async () => {
    const api = setup([], []);
    const action = await syncLabel(api, 101, {
      name: NAME,
      shouldHave: true,
      currentLabels: [],
      dryRun: false,
      log: makeLogger(),
    });
    expect(action).toBe('added');
    expect(api.writes).toEqual([
      { method: 'createLabel', args: [NAME, LABEL_COLOR, LABEL_DESCRIPTION] },
      { method: 'addLabel', args: [101, NAME] },
    ]);
  });

  it('does not recreate a label that already exists', async () => {
    const api = setup([NAME], []);
    await syncLabel(api, 101, {
      name: NAME,
      shouldHave: true,
      currentLabels: [],
      dryRun: false,
      log: makeLogger(),
    });
    expect(api.writes).toEqual([{ method: 'addLabel', args: [101, NAME] }]);
  });

  it('removes the label once everything passes, matching case-insensitively', async () => {
    const api = setup([NAME], ['Needs-Author-Attention']);
    const action = await syncLabel(api, 101, {
      name: NAME,
      shouldHave: false,
      currentLabels: ['Needs-Author-Attention'],
      dryRun: false,
      log: makeLogger(),
    });
    expect(action).toBe('removed');
    expect(api.writes).toEqual([{ method: 'removeLabel', args: [101, 'Needs-Author-Attention'] }]);
  });

  it.each([
    [true, [NAME]],
    [false, []],
  ])('is a no-op when shouldHave=%s already matches', async (shouldHave, current) => {
    const api = setup([NAME], current);
    const action = await syncLabel(api, 101, {
      name: NAME,
      shouldHave,
      currentLabels: current,
      dryRun: false,
      log: makeLogger(),
    });
    expect(action).toBe('unchanged');
    expect(api.writes).toEqual([]);
  });

  it('never writes in dry-run mode', async () => {
    const api = setup([], [NAME]);
    const add = await syncLabel(api, 101, {
      name: NAME,
      shouldHave: true,
      currentLabels: [],
      dryRun: true,
      log: makeLogger(),
    });
    const remove = await syncLabel(api, 101, {
      name: NAME,
      shouldHave: false,
      currentLabels: [NAME],
      dryRun: true,
      log: makeLogger(),
    });
    expect([add, remove]).toEqual(['dry-run', 'dry-run']);
    expect(api.writes).toEqual([]);
  });
});
