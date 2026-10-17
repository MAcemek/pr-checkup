import type { CheckOutcome, TemplateVars } from '../types.js';

export function pass(message: string, vars: TemplateVars = {}): CheckOutcome {
  return { status: 'pass', message, howToFix: '', vars };
}

export function fail(message: string, howToFix: string, vars: TemplateVars = {}): CheckOutcome {
  return { status: 'fail', message, howToFix, vars };
}

export function notApplicable(message: string, vars: TemplateVars = {}): CheckOutcome {
  return { status: 'not-applicable', message, howToFix: '', vars };
}
