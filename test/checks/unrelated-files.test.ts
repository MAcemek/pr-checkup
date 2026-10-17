import { describe, expect, it } from 'vitest';
import { isWhitespaceOnlyPatch, runUnrelatedFiles } from '../../src/checks/unrelated-files.js';
import { checkConfig, makeContext, makeFile } from '../helpers/factories.js';

const config = checkConfig('unrelated-files');
const INDENT_ONLY = '@@ -1,2 +1,2 @@\n-  return 1;\n-}\n+    return 1;\n+}';

describe('unrelated-files', () => {
  it('passes for ordinary source changes', () => {
    expect(runUnrelatedFiles(makeContext(), config).status).toBe('pass');
  });

  it('fails when a lockfile changed without its manifest', () => {
    const files = [makeFile('src/a.ts'), makeFile('package-lock.json')];
    const result = runUnrelatedFiles(makeContext({ files }), config);
    expect(result.status).toBe('fail');
    expect(result.message).toBe(
      "`package-lock.json` changed, but the matching dependency manifest didn't.",
    );
    expect(result.vars.lockfiles).toBe('`package-lock.json`');
  });

  it('passes when the manifest changed too', () => {
    const files = [makeFile('package.json'), makeFile('package-lock.json')];
    expect(runUnrelatedFiles(makeContext({ files }), config).status).toBe('pass');
  });

  it('looks for the manifest in the same directory as the lockfile', () => {
    const nestedOk = [makeFile('packages/a/package.json'), makeFile('packages/a/yarn.lock')];
    const nestedBad = [makeFile('package.json'), makeFile('packages/a/yarn.lock')];
    expect(runUnrelatedFiles(makeContext({ files: nestedOk }), config).status).toBe('pass');
    expect(runUnrelatedFiles(makeContext({ files: nestedBad }), config).status).toBe('fail');
  });

  it('fails when generated or vendored files are touched', () => {
    const files = [makeFile('src/a.ts'), makeFile('dist/index.js'), makeFile('web/app.min.js')];
    const result = runUnrelatedFiles(makeContext({ files }), config);
    expect(result.status).toBe('fail');
    expect(result.message).toBe(
      'This PR touches generated or vendored files: `dist/index.js`, `web/app.min.js`.',
    );
  });

  it('fails for whitespace-only modified files unless disabled', () => {
    const files = [makeFile('src/a.ts', { patch: INDENT_ONLY })];
    const result = runUnrelatedFiles(makeContext({ files }), config);
    expect(result.status).toBe('fail');
    expect(result.message).toBe('These files only have whitespace changes: `src/a.ts`.');
    const relaxed = checkConfig('unrelated-files', { whitespace_only: false });
    expect(runUnrelatedFiles(makeContext({ files }), relaxed).status).toBe('pass');
  });

  it('ignores whitespace-looking patches on added files', () => {
    const files = [makeFile('src/a.ts', { status: 'added', patch: '@@ -0,0 +1 @@\n+   ' })];
    expect(runUnrelatedFiles(makeContext({ files }), config).status).toBe('pass');
  });

  it('combines several problems into one message', () => {
    const files = [makeFile('yarn.lock'), makeFile('vendor/lib.go')];
    const result = runUnrelatedFiles(makeContext({ files }), config);
    expect(result.message).toContain('`yarn.lock` changed');
    expect(result.message).toContain('`vendor/lib.go`');
  });
});

describe('isWhitespaceOnlyPatch', () => {
  it('detects indentation-only changes', () => {
    expect(isWhitespaceOnlyPatch(INDENT_ONLY)).toBe(true);
  });

  it('detects blank-line-only changes', () => {
    expect(isWhitespaceOnlyPatch('@@ -1,1 +1,2 @@\n a\n+\n b')).toBe(true);
  });

  it('rejects real changes', () => {
    expect(isWhitespaceOnlyPatch('@@ -1 +1 @@\n-return 1;\n+return 2;')).toBe(false);
  });

  it('rejects reordered lines', () => {
    expect(isWhitespaceOnlyPatch('@@ -1,2 +1,2 @@\n-a\n-b\n+b\n+a')).toBe(false);
  });

  it('rejects a patch with no changed lines', () => {
    expect(isWhitespaceOnlyPatch('@@ -1 +1 @@\n unchanged')).toBe(false);
  });
});
