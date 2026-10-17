import type { CommentAction } from './comment.js';
import type { LabelAction } from './labels.js';
import type { CheckResult } from './types.js';

export interface SummaryInput {
  number: number;
  results: CheckResult[];
  commentAction: CommentAction;
  labelAction: LabelAction;
  dryRun: boolean;
}

function cell(text: string): string {
  return text.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
}

function resultLabel(result: CheckResult): string {
  if (result.status === 'pass') return '✅ pass';
  if (result.status === 'not-applicable') return '➖ n/a';
  return result.level === 'required' ? '⬜ needs attention' : '💡 suggestion';
}

export function renderSummary(input: SummaryInput): string {
  const lines = [
    `## pr-checkup: PR #${input.number}${input.dryRun ? ' (dry run)' : ''}`,
    '',
    '| Check | Level | Result | Details |',
    '| --- | --- | --- | --- |',
    ...input.results.map(
      (result) =>
        `| ${cell(result.title)} | ${result.level} | ${resultLabel(result)} | ${cell(result.message)} |`,
    ),
    '',
    `Comment: ${input.commentAction}. Label: ${input.labelAction}.`,
  ];
  return `${lines.join('\n')}\n`;
}

export function renderSkipSummary(number: number, reason: string): string {
  return `## pr-checkup: PR #${number}\n\nSkipped because ${reason}.\n`;
}
