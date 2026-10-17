import type { LinkedIssueConfig } from '../config.js';
import { stripHtmlComments } from '../text.js';
import type { CheckOutcome, PrContext } from '../types.js';
import { fail, pass } from './outcome.js';

export const BARE_REF = /(?:^|[\s([{,;:])#\d+\b/m;
export const CROSS_REPO_REF = /\b[\w.-]+\/[\w.-]+#\d+\b/;
export const GITHUB_URL_REF =
  /https?:\/\/github\.com\/[\w.-]+\/[\w.-]+\/(?:issues|pull|discussions)\/\d+/i;
export const GH_REF = /\bGH-\d+\b/;
export const CLOSING_KEYWORD_REF =
  /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b:?\s+(?:[\w.-]+\/[\w.-]+#\d+|#\d+|https?:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/\d+)/i;

export function runLinkedIssue(ctx: PrContext, config: LinkedIssueConfig): CheckOutcome {
  const body = stripHtmlComments(ctx.body);
  const extra = config.extra_patterns.map((pattern) => new RegExp(pattern));

  if (config.require_keyword) {
    if (CLOSING_KEYWORD_REF.test(body) || extra.some((re) => re.test(body))) {
      return pass('The description says which issue this PR closes.');
    }
    return fail(
      'I couldn\'t find a closing keyword such as "Fixes #123" in the description.',
      'Add a line like `Fixes #123` (or `Closes #123` / `Resolves #123`) so the issue closes automatically when this PR is merged.',
    );
  }

  const haystack = `${ctx.title}\n${body}`;
  const patterns = [BARE_REF, CROSS_REPO_REF, GITHUB_URL_REF, GH_REF, ...extra];
  if (patterns.some((re) => re.test(haystack))) {
    return pass('This PR links to an issue.');
  }
  return fail(
    "I couldn't find a link to an issue in the title or description.",
    "Mention the issue this PR addresses, for example `Fixes #123`. If there isn't one yet, opening an issue first is a great way to agree on the approach before you put in more time.",
  );
}
