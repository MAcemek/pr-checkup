import { describe, expect, it } from 'vitest';
import { runDiffSize } from '../../src/checks/diff-size.js';
import { checkConfig, makeContext, makeFile } from '../helpers/factories.js';

const config = checkConfig('diff-size');

describe('diff-size', () => {
  it('passes for a small PR', () => {
    const result = runDiffSize(makeContext(), config);
    expect(result.status).toBe('pass');
    expect(result.message).toBe(
      'This PR is a comfortable size to review (2 lines across 2 files).',
    );
  });

  it('fails when too many lines changed', () => {
    const files = [makeFile('src/big.ts', { additions: 1150, deletions: 50 })];
    const result = runDiffSize(makeContext({ files }), config);
    expect(result.status).toBe('fail');
    expect(result.message).toBe(
      'This PR changes 1,200 lines across 1 file (the suggested maximum is 800 lines or 30 files).',
    );
    expect(result.vars).toEqual({ files: 1, lines: 1200, max_files: 30, max_lines: 800 });
  });

  it('fails when too many files changed', () => {
    const files = Array.from({ length: 31 }, (_, i) => makeFile(`src/f${i}.ts`));
    expect(runDiffSize(makeContext({ files }), config).status).toBe('fail');
  });

  it('does not count ignored files such as lockfiles', () => {
    const files = [
      makeFile('package-lock.json', { additions: 5000 }),
      makeFile('web/package-lock.json', { additions: 5000 }),
      makeFile('src/a.ts'),
    ];
    const result = runDiffSize(makeContext({ files }), config);
    expect(result.status).toBe('pass');
    expect(result.vars.lines).toBe(1);
  });

  it('falls back to the PR totals when the file list was truncated', () => {
    const ctx = makeContext({
      filesTruncated: true,
      changedFiles: 3500,
      additions: 10,
      deletions: 10,
      files: [makeFile('src/a.ts')],
    });
    const result = runDiffSize(ctx, config);
    expect(result.status).toBe('fail');
    expect(result.vars.files).toBe(3500);
  });
});
