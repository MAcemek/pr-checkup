import type { TestsIncludedConfig } from '../config.js';
import { matchesAny } from '../glob.js';
import { formatList } from '../text.js';
import type { CheckOutcome, PrContext } from '../types.js';
import { fail, notApplicable, pass } from './outcome.js';

export function runTestsIncluded(ctx: PrContext, config: TestsIncludedConfig): CheckOutcome {
  const present = ctx.files.filter((file) => file.status !== 'removed');
  const isTest = (filename: string): boolean => matchesAny(filename, config.test_globs);
  const sourceFiles = present
    .map((file) => file.filename)
    .filter(
      (filename) =>
        matchesAny(filename, config.source_globs) &&
        !isTest(filename) &&
        !matchesAny(filename, config.ignore),
    );

  if (sourceFiles.length === 0) {
    return notApplicable('No source files changed.');
  }
  const vars = { source_count: sourceFiles.length, source_files: formatList(sourceFiles) };
  if (present.some((file) => isTest(file.filename))) {
    return pass('Tests were updated alongside the code.', vars);
  }
  return fail(
    `Source files changed (${formatList(sourceFiles)}) but no test files did.`,
    "If you can, add or update a test that covers this change. If a test doesn't make sense here (for example, a pure refactor), just say so in the description and a maintainer can take it from there.",
    vars,
  );
}
