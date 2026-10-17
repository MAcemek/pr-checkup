import { posix } from 'node:path';
import type { UnrelatedFilesConfig } from '../config.js';
import { matchesAny } from '../glob.js';
import { formatList } from '../text.js';
import type { CheckOutcome, PrContext } from '../types.js';
import { fail, pass } from './outcome.js';

/** True when the added and removed lines of a patch are identical once all whitespace is removed. */
export function isWhitespaceOnlyPatch(patch: string): boolean {
  const added: string[] = [];
  const removed: string[] = [];
  for (const line of patch.split('\n')) {
    if (line.startsWith('@@')) continue;
    if (line.startsWith('+')) added.push(line.slice(1).replace(/\s+/g, ''));
    else if (line.startsWith('-')) removed.push(line.slice(1).replace(/\s+/g, ''));
  }
  if (added.length + removed.length === 0) return false;
  return added.join('') === removed.join('');
}

export function runUnrelatedFiles(ctx: PrContext, config: UnrelatedFilesConfig): CheckOutcome {
  const changed = new Set(ctx.files.map((file) => file.filename));
  const problems: string[] = [];
  const fixes: string[] = [];

  const orphanLockfiles: string[] = [];
  for (const file of ctx.files) {
    const base = posix.basename(file.filename);
    const manifestName = Object.hasOwn(config.lockfiles, base) ? config.lockfiles[base] : undefined;
    if (manifestName === undefined) continue;
    const dir = posix.dirname(file.filename);
    const manifest = dir === '.' ? manifestName : `${dir}/${manifestName}`;
    if (!changed.has(manifest)) orphanLockfiles.push(file.filename);
  }
  if (orphanLockfiles.length > 0) {
    problems.push(
      `${formatList(orphanLockfiles)} changed, but the matching dependency manifest didn't.`,
    );
    fixes.push(
      'Lockfile changes like this usually come from running a package manager locally. Unless this PR is meant to change dependencies, please revert the lockfile.',
    );
  }

  const generated = ctx.files
    .map((file) => file.filename)
    .filter((filename) => matchesAny(filename, config.generated_globs));
  if (generated.length > 0) {
    problems.push(`This PR touches generated or vendored files: ${formatList(generated)}.`);
    fixes.push(
      'Those files are normally produced by the build or a package manager, so please revert them and keep only your source changes.',
    );
  }

  const whitespaceOnly = config.whitespace_only
    ? ctx.files
        .filter(
          (file) =>
            file.status === 'modified' &&
            file.patch !== undefined &&
            isWhitespaceOnlyPatch(file.patch),
        )
        .map((file) => file.filename)
    : [];
  if (whitespaceOnly.length > 0) {
    problems.push(`These files only have whitespace changes: ${formatList(whitespaceOnly)}.`);
    fixes.push(
      "Unless reformatting is the goal of this PR, please revert those files (an editor's format-on-save setting often causes this).",
    );
  }

  const vars = {
    lockfiles: formatList(orphanLockfiles),
    generated: formatList(generated),
    whitespace: formatList(whitespaceOnly),
  };
  if (problems.length === 0) {
    return pass('Every changed file looks related to the change.', vars);
  }
  return fail(problems.join(' '), fixes.join(' '), vars);
}
