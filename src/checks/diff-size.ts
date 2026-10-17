import type { DiffSizeConfig } from '../config.js';
import { matchesAny } from '../glob.js';
import { plural } from '../text.js';
import type { CheckOutcome, PrContext } from '../types.js';
import { fail, pass } from './outcome.js';

export function runDiffSize(ctx: PrContext, config: DiffSizeConfig): CheckOutcome {
  let files: number;
  let lines: number;
  if (ctx.filesTruncated) {
    files = ctx.changedFiles;
    lines = ctx.additions + ctx.deletions;
  } else {
    const counted = ctx.files.filter((file) => !matchesAny(file.filename, config.ignore));
    files = counted.length;
    lines = counted.reduce((sum, file) => sum + file.additions + file.deletions, 0);
  }
  const vars = { files, lines, max_files: config.max_files, max_lines: config.max_lines };
  if (files > config.max_files || lines > config.max_lines) {
    return fail(
      `This PR changes ${plural(lines, 'line')} across ${plural(files, 'file')} (the suggested maximum is ${plural(config.max_lines, 'line')} or ${plural(config.max_files, 'file')}).`,
      'Big PRs take much longer to review. If parts of this change can stand on their own, consider splitting them into smaller PRs.',
      vars,
    );
  }
  return pass(
    `This PR is a comfortable size to review (${plural(lines, 'line')} across ${plural(files, 'file')}).`,
    vars,
  );
}
