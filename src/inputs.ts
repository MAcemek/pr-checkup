export interface ActionInputs {
  githubToken: string;
  configPath: string;
  /** Empty string disables labeling. */
  label: string;
  failOnIssues: boolean;
  dryRun: boolean;
}

export const DEFAULT_CONFIG_PATH = '.github/pr-checkup.yml';

export function parseBooleanInput(name: string, value: string, fallback: boolean): boolean {
  const normalized = value.trim().toLowerCase();
  if (normalized === '') return fallback;
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error(`Input "${name}" must be "true" or "false", but got "${value}".`);
}

export function readInputs(getInput: (name: string) => string): ActionInputs {
  return {
    githubToken: getInput('github-token').trim(),
    configPath: getInput('config-path').trim() || DEFAULT_CONFIG_PATH,
    label: getInput('label').trim(),
    failOnIssues: parseBooleanInput('fail-on-issues', getInput('fail-on-issues'), false),
    dryRun: parseBooleanInput('dry-run', getInput('dry-run'), false),
  };
}
