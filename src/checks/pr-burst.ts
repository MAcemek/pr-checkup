import type { PrBurstConfig } from '../config.js';
import type { CheckOutcome, PrContext } from '../types.js';
import { fail, notApplicable, pass } from './outcome.js';

export function runPrBurst(ctx: PrContext, config: PrBurstConfig): CheckOutcome {
  if (ctx.recentPrCount === null) {
    return notApplicable('Recent pull request activity could not be checked.');
  }
  const vars = {
    count: ctx.recentPrCount,
    max_prs: config.max_prs,
    window_hours: config.window_hours,
  };
  if (ctx.recentPrCount > config.max_prs) {
    return fail(
      `You've opened ${ctx.recentPrCount} pull requests across GitHub in the last ${config.window_hours} hours.`,
      "That's completely fine if they're all intentional! Maintainers here prefer a few focused contributions over many quick ones, so please double-check that this one is ready for review.",
      vars,
    );
  }
  return pass('Recent pull request activity looks normal.', vars);
}
