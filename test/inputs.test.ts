import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG_PATH, parseBooleanInput, readInputs } from '../src/inputs.js';

function reader(values: Record<string, string>): (name: string) => string {
  return (name) => values[name] ?? '';
}

describe('readInputs', () => {
  it('applies defaults when inputs are empty', () => {
    expect(readInputs(reader({}))).toEqual({
      githubToken: '',
      configPath: DEFAULT_CONFIG_PATH,
      label: '',
      failOnIssues: false,
      dryRun: false,
    });
  });

  it('reads and trims every input', () => {
    expect(
      readInputs(
        reader({
          'github-token': ' t0k ',
          'config-path': ' .github/custom.yml ',
          label: ' needs-author-attention ',
          'fail-on-issues': 'TRUE',
          'dry-run': 'true',
        }),
      ),
    ).toEqual({
      githubToken: 't0k',
      configPath: '.github/custom.yml',
      label: 'needs-author-attention',
      failOnIssues: true,
      dryRun: true,
    });
  });
});

describe('parseBooleanInput', () => {
  it('parses true and false in any case and falls back when empty', () => {
    expect(parseBooleanInput('x', 'False', true)).toBe(false);
    expect(parseBooleanInput('x', 'true', false)).toBe(true);
    expect(parseBooleanInput('x', '', true)).toBe(true);
  });

  it('rejects anything else with a clear message', () => {
    expect(() => parseBooleanInput('dry-run', 'yes', false)).toThrow(
      'Input "dry-run" must be "true" or "false", but got "yes".',
    );
  });
});
