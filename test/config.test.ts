import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ConfigError,
  DEFAULT_CONFIG,
  levenshtein,
  loadConfig,
  parseConfig,
  validateAndMerge,
} from '../src/config.js';
import { FakeGitHubApi } from './helpers/fake-api.js';
import { loadScenario, makeLogger } from './helpers/factories.js';

function errorOf(yamlText: string): string {
  try {
    parseConfig(yamlText, 'test.yml');
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return (error as Error).message;
  }
  throw new Error('expected parseConfig to throw');
}

describe('parseConfig', () => {
  it('returns the defaults for an empty file', () => {
    expect(parseConfig('', 'test.yml')).toEqual(DEFAULT_CONFIG);
  });

  it('returns a copy that does not share objects with DEFAULT_CONFIG', () => {
    const config = parseConfig('', 'test.yml');
    config.skip.authors.push('mallory');
    config.checks.description.min_length = 1;
    expect(DEFAULT_CONFIG.skip.authors).toEqual([]);
    expect(DEFAULT_CONFIG.checks.description.min_length).toBe(30);
  });

  it('deep-merges partial settings over the defaults', () => {
    const config = parseConfig('checks:\n  description:\n    min_length: 50\n', 'test.yml');
    expect(config.checks.description).toEqual({
      ...DEFAULT_CONFIG.checks.description,
      min_length: 50,
    });
    expect(config.checks['linked-issue']).toEqual(DEFAULT_CONFIG.checks['linked-issue']);
    expect(config.skip).toEqual(DEFAULT_CONFIG.skip);
  });

  it('replaces lists instead of appending to them', () => {
    const config = parseConfig('skip:\n  authors: [alice]\n', 'test.yml');
    expect(config.skip.authors).toEqual(['alice']);
    expect(config.skip.labels).toEqual(['skip-checkup']);
  });

  it('replaces the lockfiles map entirely', () => {
    const config = parseConfig(
      'checks:\n  unrelated-files:\n    lockfiles:\n      deno.lock: deno.json\n',
      'test.yml',
    );
    expect(config.checks['unrelated-files'].lockfiles).toEqual({ 'deno.lock': 'deno.json' });
  });

  it('treats empty sections as "use the defaults"', () => {
    expect(parseConfig('skip:\nchecks:\n', 'test.yml')).toEqual(DEFAULT_CONFIG);
  });

  it('accepts message overrides and an explicit null', () => {
    const config = parseConfig(
      'checks:\n  description:\n    message: "Please write more"\n  diff-size:\n    message: null\n',
      'test.yml',
    );
    expect(config.checks.description.message).toBe('Please write more');
    expect(config.checks['diff-size'].message).toBeNull();
  });

  it('reports unknown keys with a suggestion', () => {
    expect(errorOf('skipp:\n  drafts: false\n')).toContain(
      'Unknown key "skipp". Did you mean "skip"?',
    );
    expect(errorOf('checks:\n  linked-issue:\n    require_keywords: true\n')).toContain(
      'Unknown key "checks.linked-issue.require_keywords". Did you mean "require_keyword"?',
    );
  });

  it('reports unknown check ids', () => {
    expect(errorOf('checks:\n  size:\n    enabled: false\n')).toContain(
      'Unknown key "checks.size"',
    );
  });

  it('reports wrong types with the path and the offending value', () => {
    expect(errorOf('comment:\n  post_when_passing: "yes"\n')).toContain(
      '"comment.post_when_passing" must be true or false, but got string "yes".',
    );
    expect(errorOf('skip:\n  authors: alice\n')).toContain(
      '"skip.authors" must be a list of strings',
    );
    expect(errorOf('checks:\n  description:\n    message: 5\n')).toContain(
      '"checks.description.message" must be a string',
    );
  });

  it('validates integers and their minimums', () => {
    expect(errorOf('checks:\n  diff-size:\n    max_lines: 0\n')).toContain(
      '"checks.diff-size.max_lines" must be a whole number of at least 1, but got number 0.',
    );
    expect(errorOf('checks:\n  description:\n    min_length: 2.5\n')).toContain(
      '"checks.description.min_length" must be a whole number of at least 0',
    );
  });

  it('validates enums', () => {
    expect(errorOf('checks:\n  diff-size:\n    level: warn\n')).toContain(
      '"checks.diff-size.level" must be one of: required, info',
    );
    expect(errorOf('skip:\n  author_associations: [ADMIN]\n')).toContain(
      '"skip.author_associations" contains "ADMIN"',
    );
  });

  it('validates regular expressions', () => {
    expect(errorOf("checks:\n  linked-issue:\n    extra_patterns: ['(']\n")).toContain(
      'invalid regular expression: (',
    );
  });

  it('reports every problem at once', () => {
    const message = errorOf('skipp: 1\ncomment:\n  post_when_passing: 1\n');
    expect(message.startsWith('Invalid pr-checkup config in test.yml:')).toBe(true);
    expect(message.split('\n').filter((line) => line.startsWith('  - '))).toHaveLength(2);
  });

  it('rejects a file that is not a mapping', () => {
    expect(errorOf('- a\n- b\n')).toContain('The config file must be a mapping, but got a list.');
  });

  it('reports YAML syntax errors', () => {
    expect(errorOf('skip: [unclosed\n')).toContain('Could not parse test.yml as YAML');
  });

  it('accepts the example config shipped in examples/', () => {
    const text = readFileSync(new URL('../examples/pr-checkup.yml', import.meta.url), 'utf8');
    expect(parseConfig(text, 'examples/pr-checkup.yml')).toEqual(DEFAULT_CONFIG);
  });

  it("accepts the repository's own .github/pr-checkup.yml", () => {
    const text = readFileSync(new URL('../.github/pr-checkup.yml', import.meta.url), 'utf8');
    expect(() => parseConfig(text, '.github/pr-checkup.yml')).not.toThrow();
  });
});

describe('validateAndMerge', () => {
  it('treats undefined and null as the defaults', () => {
    expect(validateAndMerge(undefined)).toEqual(DEFAULT_CONFIG);
    expect(validateAndMerge(null)).toEqual(DEFAULT_CONFIG);
  });
});

describe('levenshtein', () => {
  it('computes edit distance', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('skip', 'skip')).toBe(0);
  });
});

describe('loadConfig', () => {
  it('uses the defaults and logs when the file does not exist', async () => {
    const api = new FakeGitHubApi(loadScenario('needs-attention'));
    const log = makeLogger();
    const config = await loadConfig(api, '.github/pr-checkup.yml', 'main', log);
    expect(config).toEqual(DEFAULT_CONFIG);
    expect(log.lines).toContain(
      'info: No config file at .github/pr-checkup.yml on main; using the default settings.',
    );
  });

  it('reads the file from the given base ref', async () => {
    const api = new FakeGitHubApi(loadScenario('all-good'));
    const config = await loadConfig(api, '.github/pr-checkup.yml', 'main', makeLogger());
    expect(config.checks['diff-size'].max_lines).toBe(2000);
    expect(api.calls).toContainEqual({
      method: 'getFileContent',
      args: ['.github/pr-checkup.yml', 'main'],
    });
  });
});
