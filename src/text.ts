import type { TemplateVars } from './types.js';

const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const CHECKBOX_LINE = /^\s*[-*+]\s+\[[ xX]\]/;

export function stripHtmlComments(text: string): string {
  return text.replace(HTML_COMMENT, '');
}

export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function normalizeLine(line: string): string {
  return collapseWhitespace(line).toLowerCase();
}

export function normalizeForCompare(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function isCheckboxLine(line: string): boolean {
  return CHECKBOX_LINE.test(line);
}

/**
 * The text the author actually wrote: the body without HTML comments, without
 * checklist lines, and without any line that also appears in the template.
 */
export function authoredText(body: string, template: string | null): string {
  const templateLines = new Set(
    template === null
      ? []
      : stripHtmlComments(template)
          .split(/\r?\n/)
          .map(normalizeLine)
          .filter((line) => line !== ''),
  );
  return stripHtmlComments(body)
    .split(/\r?\n/)
    .filter((line) => {
      const normalized = normalizeLine(line);
      return normalized !== '' && !isCheckboxLine(line) && !templateLines.has(normalized);
    })
    .join('\n');
}

export function fillTemplate(text: string, vars: TemplateVars): string {
  return text.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}

export function formatList(items: string[], max = 5): string {
  const shown = items.slice(0, max).map((item) => `\`${item}\``);
  const rest = items.length - shown.length;
  return rest > 0 ? `${shown.join(', ')} and ${rest} more` : shown.join(', ');
}

export function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}

export function plural(count: number, word: string): string {
  return `${formatNumber(count)} ${count === 1 ? word : `${word}s`}`;
}
