import type { ChecksConfig, Config } from '../config.js';
import { fillTemplate } from '../text.js';
import {
  CHECK_IDS,
  type CheckId,
  type CheckOutcome,
  type CheckResult,
  type PrContext,
} from '../types.js';
import { runDescription } from './description.js';
import { runDiffSize } from './diff-size.js';
import { runLinkedIssue } from './linked-issue.js';
import { runPrBurst } from './pr-burst.js';
import { runTemplateFilled } from './template-filled.js';
import { runTestsIncluded } from './tests-included.js';
import { runUnrelatedFiles } from './unrelated-files.js';

type CheckRunners = {
  [K in CheckId]: (ctx: PrContext, config: ChecksConfig[K]) => CheckOutcome;
};

export const CHECK_RUNNERS: CheckRunners = {
  'linked-issue': runLinkedIssue,
  'template-filled': runTemplateFilled,
  description: runDescription,
  'tests-included': runTestsIncluded,
  'unrelated-files': runUnrelatedFiles,
  'diff-size': runDiffSize,
  'pr-burst': runPrBurst,
};

export const CHECK_TITLES: Record<CheckId, string> = {
  'linked-issue': 'Linked issue',
  'template-filled': 'PR template filled in',
  description: 'Description',
  'tests-included': 'Tests included',
  'unrelated-files': 'Only related files changed',
  'diff-size': 'Reviewable size',
  'pr-burst': 'Recent PR activity',
};

function runOne<K extends CheckId>(id: K, ctx: PrContext, checks: ChecksConfig): CheckResult {
  const config = checks[id];
  const runner: (ctx: PrContext, config: ChecksConfig[K]) => CheckOutcome = CHECK_RUNNERS[id];
  const outcome = runner(ctx, config);
  if (outcome.status === 'fail') {
    if (config.message !== null) outcome.message = fillTemplate(config.message, outcome.vars);
    if (config.how_to_fix !== null) {
      outcome.howToFix = fillTemplate(config.how_to_fix, outcome.vars);
    }
  }
  return { id, title: CHECK_TITLES[id], level: config.level, ...outcome };
}

/** Runs every enabled check in CHECK_IDS order. Pure: no network access and no side effects. */
export function runChecks(ctx: PrContext, config: Config): CheckResult[] {
  return CHECK_IDS.filter((id) => config.checks[id].enabled).map((id) =>
    runOne(id, ctx, config.checks),
  );
}
