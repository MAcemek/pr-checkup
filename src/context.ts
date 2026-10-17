import type { Config } from './config.js';
import type { GitHubApi } from './github.js';
import type { Logger, PrContext, PullRequestData } from './types.js';

/** GitHub's pull request files endpoint returns at most 3000 files. */
export const MAX_FILES = 3000;

export async function findTemplate(
  api: GitHubApi,
  paths: string[],
  ref: string,
): Promise<string | null> {
  for (const path of paths) {
    const content = await api.getFileContent(path, ref);
    if (content !== null) return content;
  }
  return null;
}

export function sinceIso(now: Date, hours: number): string {
  return new Date(now.getTime() - hours * 3_600_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

async function countRecentPrs(
  api: GitHubApi,
  login: string,
  hours: number,
  now: Date,
  log: Logger,
): Promise<number | null> {
  try {
    return await api.countRecentPullRequests(login, sinceIso(now, hours));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.warning(
      `Could not look up recent pull requests by ${login} (${reason}). Skipping the pr-burst check.`,
    );
    return null;
  }
}

/**
 * Fetches everything the checks need, exactly once. Only reads data through the API:
 * the PR's code is never checked out or executed.
 */
export async function buildPrContext(
  api: GitHubApi,
  pull: PullRequestData,
  repo: { owner: string; repo: string },
  config: Config,
  now: Date,
  log: Logger,
): Promise<PrContext> {
  const files = await api.listPullFiles(pull.number, MAX_FILES);
  const needsTemplate =
    config.checks['template-filled'].enabled || config.checks.description.enabled;
  const template = needsTemplate
    ? await findTemplate(api, config.checks['template-filled'].template_paths, pull.baseRef)
    : null;
  const burst = config.checks['pr-burst'];
  const recentPrCount = burst.enabled
    ? await countRecentPrs(api, pull.authorLogin, burst.window_hours, now, log)
    : null;

  return {
    owner: repo.owner,
    repo: repo.repo,
    number: pull.number,
    title: pull.title,
    body: pull.body,
    authorLogin: pull.authorLogin,
    authorAssociation: pull.authorAssociation,
    additions: pull.additions,
    deletions: pull.deletions,
    changedFiles: pull.changedFiles,
    files,
    filesTruncated: pull.changedFiles > files.length,
    template,
    recentPrCount,
  };
}
