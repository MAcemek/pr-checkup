import type { TemplateFilledConfig } from '../config.js';
import {
  authoredText,
  collapseWhitespace,
  formatList,
  normalizeLine,
  stripHtmlComments,
} from '../text.js';
import type { CheckOutcome, PrContext } from '../types.js';
import { fail, notApplicable, pass } from './outcome.js';

const HEADING = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/;
const UNCHECKED_BOX = /^\s*[-*+]\s+\[ \]/m;
const CHECKED_BOX = /^\s*[-*+]\s+\[[xX]\]/m;

function headingText(line: string): string | null {
  const match = HEADING.exec(line);
  if (!match?.[1]) return null;
  return normalizeLine(match[1]).replace(/:$/, '');
}

/** Returns the text under the given heading (up to the next heading), or null if the heading is missing. */
export function sectionContent(markdown: string, heading: string): string | null {
  const wanted = normalizeLine(heading).replace(/:$/, '');
  const lines = stripHtmlComments(markdown).split(/\r?\n/);
  const start = lines.findIndex((line) => headingText(line) === wanted);
  if (start === -1) return null;
  const content: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (headingText(line) !== null) break;
    content.push(line);
  }
  return content.join('\n');
}

export function runTemplateFilled(ctx: PrContext, config: TemplateFilledConfig): CheckOutcome {
  if (ctx.template === null) {
    return notApplicable('This repository has no pull request template.');
  }

  const body = stripHtmlComments(ctx.body);
  const template = stripHtmlComments(ctx.template);
  const addedChars = collapseWhitespace(authoredText(ctx.body, ctx.template)).length;
  const problems: string[] = [];
  const fixes: string[] = [];
  const unfilledSections: string[] = [];
  const fillIn = 'Fill in each section of the template with details about your change.';

  if (collapseWhitespace(body) === '') {
    problems.push("The description is empty, so the pull request template wasn't filled in.");
    fixes.push(fillIn);
  } else if (normalizeLine(body) === normalizeLine(template)) {
    problems.push('The description is still the unchanged pull request template.');
    fixes.push(fillIn);
  } else if (addedChars < config.min_added_chars) {
    problems.push(
      `The pull request template looks mostly unfilled (only ${addedChars} characters were added).`,
    );
    fixes.push(fillIn);
  }

  for (const section of config.required_sections) {
    const content = sectionContent(ctx.body, section);
    const placeholder = sectionContent(ctx.template, section);
    if (content === null || collapseWhitespace(authoredText(content, placeholder)) === '') {
      unfilledSections.push(section);
    }
  }
  if (unfilledSections.length > 0) {
    problems.push(`These sections still need content: ${formatList(unfilledSections, 10)}.`);
    fixes.push('Add a sentence or two under each of those headings.');
  }

  const templateHasBoxes = UNCHECKED_BOX.test(template) || CHECKED_BOX.test(template);
  if (
    config.require_checked_box &&
    templateHasBoxes &&
    UNCHECKED_BOX.test(body) &&
    !CHECKED_BOX.test(body)
  ) {
    problems.push('None of the checklist items are ticked.');
    fixes.push('Tick the items that apply by changing `[ ]` to `[x]`.');
  }

  const vars = {
    added_chars: addedChars,
    min_added_chars: config.min_added_chars,
    sections: formatList(unfilledSections, 10),
  };
  if (problems.length === 0) {
    return pass('The pull request template is filled in.', vars);
  }
  return fail(
    problems.join(' '),
    `${[...new Set(fixes)].join(' ')} You can edit the description at any time and I'll check again.`,
    vars,
  );
}
