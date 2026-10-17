import type { DescriptionConfig } from '../config.js';
import {
  authoredText,
  collapseWhitespace,
  normalizeForCompare,
  stripHtmlComments,
} from '../text.js';
import type { CheckOutcome, PrContext } from '../types.js';
import { fail, pass } from './outcome.js';

const ADD_CONTEXT =
  'Add a few sentences about what this PR changes and why. How you tested it, and screenshots for UI changes, are very welcome too.';

export function runDescription(ctx: PrContext, config: DescriptionConfig): CheckOutcome {
  const authored = collapseWhitespace(authoredText(ctx.body, ctx.template));
  const vars = { length: authored.length, min_length: config.min_length };

  if (collapseWhitespace(stripHtmlComments(ctx.body)) === '') {
    return fail('The description is empty.', ADD_CONTEXT, vars);
  }
  if (authored === '') {
    return fail(
      "The description only contains the pull request template's text.",
      ADD_CONTEXT,
      vars,
    );
  }
  if (normalizeForCompare(authored) === normalizeForCompare(ctx.title)) {
    return fail('The description just repeats the title.', ADD_CONTEXT, vars);
  }
  if (authored.length < config.min_length) {
    return fail(
      `The description is quite short (${authored.length} characters; at least ${config.min_length} helps reviewers).`,
      ADD_CONTEXT,
      vars,
    );
  }
  return pass('The description explains the change.', vars);
}
