import { describe, expect, it } from 'vitest';
import { runChecks } from '../../src/checks/index.js';
import { defaultConfig, makeContext } from '../helpers/factories.js';

describe('runChecks', () => {
  it('runs every enabled check in a fixed order and skips disabled ones', () => {
    const results = runChecks(makeContext(), defaultConfig());
    expect(results.map((r) => r.id)).toEqual([
      'linked-issue',
      'template-filled',
      'description',
      'tests-included',
      'unrelated-files',
      'diff-size',
    ]);
  });

  it('includes pr-burst when it is enabled', () => {
    const config = defaultConfig();
    config.checks['pr-burst'].enabled = true;
    const results = runChecks(makeContext({ recentPrCount: 1 }), config);
    expect(results.at(-1)?.id).toBe('pr-burst');
  });

  it('attaches the title and level from the config', () => {
    const config = defaultConfig();
    config.checks['diff-size'].level = 'required';
    const diff = runChecks(makeContext(), config).find((r) => r.id === 'diff-size');
    expect(diff).toMatchObject({ title: 'Reviewable size', level: 'required' });
  });

  it('applies message and how_to_fix overrides with placeholders to failing checks', () => {
    const config = defaultConfig();
    config.checks.description.message = 'Too short: {length}/{min_length} {unknown}';
    config.checks.description.how_to_fix = 'Write at least {min_length} characters.';
    const result = runChecks(makeContext({ body: 'Fixes #1' }), config).find(
      (r) => r.id === 'description',
    );
    expect(result?.message).toBe('Too short: 8/30 {unknown}');
    expect(result?.howToFix).toBe('Write at least 30 characters.');
  });

  it('does not apply overrides to passing checks', () => {
    const config = defaultConfig();
    config.checks.description.message = 'Too short!';
    const result = runChecks(makeContext(), config).find((r) => r.id === 'description');
    expect(result?.status).toBe('pass');
    expect(result?.message).toBe('The description explains the change.');
  });
});
