import type { SkipConfig } from './config.js';
import type { PullRequestData } from './types.js';

/** Returns a human-readable reason to skip this PR, or null when it should be checked. */
export function getSkipReason(pull: PullRequestData, skip: SkipConfig): string | null {
  const login = pull.authorLogin.toLowerCase();
  if (pull.state !== 'open') {
    return 'the pull request is not open';
  }
  if (skip.bots && (pull.authorType === 'Bot' || login.endsWith('[bot]'))) {
    return `the author (${pull.authorLogin}) is a bot`;
  }
  if (skip.drafts && pull.draft) {
    return 'the pull request is a draft';
  }
  if (skip.authors.some((author) => author.toLowerCase() === login)) {
    return `the author (${pull.authorLogin}) is listed in skip.authors`;
  }
  if (skip.author_associations.includes(pull.authorAssociation)) {
    return `the author's association with the repository is ${pull.authorAssociation}`;
  }
  const wanted = skip.labels.map((label) => label.toLowerCase());
  const match = pull.labels.find((label) => wanted.includes(label.toLowerCase()));
  if (match !== undefined) {
    return `the pull request has the "${match}" label`;
  }
  return null;
}
