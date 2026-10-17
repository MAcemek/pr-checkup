import type { GitHubApi } from './github.js';
import type { Logger } from './types.js';

export const LABEL_COLOR = 'fbca04';
export const LABEL_DESCRIPTION = 'pr-checkup found something for the PR author to look at';

export type LabelAction = 'added' | 'removed' | 'unchanged' | 'disabled' | 'dry-run';

export interface SyncLabelOptions {
  /** Label name. An empty string disables labeling. */
  name: string;
  shouldHave: boolean;
  /** Labels currently on the PR. */
  currentLabels: string[];
  dryRun: boolean;
  log: Logger;
}

export async function ensureLabel(api: GitHubApi, name: string): Promise<void> {
  if (await api.labelExists(name)) return;
  await api.createLabel(name, LABEL_COLOR, LABEL_DESCRIPTION);
}

export async function syncLabel(
  api: GitHubApi,
  number: number,
  options: SyncLabelOptions,
): Promise<LabelAction> {
  const { name, log } = options;
  if (name === '') return 'disabled';
  const current = options.currentLabels.find((label) => label.toLowerCase() === name.toLowerCase());

  if (options.shouldHave && current === undefined) {
    if (options.dryRun) {
      log.info(`[dry-run] Would add the "${name}" label.`);
      return 'dry-run';
    }
    await ensureLabel(api, name);
    await api.addLabel(number, name);
    log.info(`Added the "${name}" label.`);
    return 'added';
  }
  if (!options.shouldHave && current !== undefined) {
    if (options.dryRun) {
      log.info(`[dry-run] Would remove the "${current}" label.`);
      return 'dry-run';
    }
    await api.removeLabel(number, current);
    log.info(`Removed the "${current}" label.`);
    return 'removed';
  }
  return 'unchanged';
}
