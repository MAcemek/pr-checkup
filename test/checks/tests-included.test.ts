import { describe, expect, it } from 'vitest';
import { runTestsIncluded } from '../../src/checks/tests-included.js';
import { checkConfig, makeContext, makeFile } from '../helpers/factories.js';

const config = checkConfig('tests-included');

describe('tests-included', () => {
  it('is not applicable when no source files changed', () => {
    const files = [makeFile('README.md'), makeFile('src/notes.md'), makeFile('docs/guide.md')];
    expect(runTestsIncluded(makeContext({ files }), config).status).toBe('not-applicable');
  });

  it('passes when a test directory file changed with the source', () => {
    const files = [makeFile('src/http.ts'), makeFile('test/http.test.ts')];
    expect(runTestsIncluded(makeContext({ files }), config).status).toBe('pass');
  });

  it('passes with a colocated test file', () => {
    const files = [makeFile('src/http.ts'), makeFile('src/http.spec.ts')];
    expect(runTestsIncluded(makeContext({ files }), config).status).toBe('pass');
  });

  it('fails when only source files changed and lists them', () => {
    const files = [makeFile('src/http.ts'), makeFile('lib/retry.js')];
    const result = runTestsIncluded(makeContext({ files }), config);
    expect(result.status).toBe('fail');
    expect(result.message).toBe(
      'Source files changed (`src/http.ts`, `lib/retry.js`) but no test files did.',
    );
    expect(result.vars.source_count).toBe(2);
  });

  it('ignores removed source files', () => {
    const files = [makeFile('src/old.ts', { status: 'removed' })];
    expect(runTestsIncluded(makeContext({ files }), config).status).toBe('not-applicable');
  });

  it('supports custom globs', () => {
    const custom = checkConfig('tests-included', {
      source_globs: ['packages/*/src/**'],
      test_globs: ['**/*.spec.ts'],
    });
    const failing = [makeFile('packages/core/src/index.ts')];
    const passing = [...failing, makeFile('packages/core/index.spec.ts')];
    expect(runTestsIncluded(makeContext({ files: failing }), custom).status).toBe('fail');
    expect(runTestsIncluded(makeContext({ files: passing }), custom).status).toBe('pass');
  });

  it('shortens long file lists', () => {
    const files = Array.from({ length: 7 }, (_, i) => makeFile(`src/file${i}.ts`));
    const result = runTestsIncluded(makeContext({ files }), config);
    expect(result.message).toContain('and 2 more');
  });
});
