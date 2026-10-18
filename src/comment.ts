import type { MessagesConfig } from './config.js';
import { httpStatus, type GitHubApi } from './github.js';
import { fillTemplate } from './text.js';
import type { AuthorAssociation, CheckResult, IssueComment, Logger } from './types.js';

/** Hidden marker that identifies pr-checkup's sticky comment. Must stay stable across versions. */
export const MARKER = '<!-- pr-checkup -->';
export const PROJECT_URL = 'https://github.com/MAcemek/pr-checkup';

export interface RenderInput {
  results: CheckResult[];
  messages: MessagesConfig;
  welcome: boolean;
  authorLogin: string;
  repoFullName: string;
}

export function isFirstTimer(association: AuthorAssociation): boolean {
  return association === 'FIRST_TIME_CONTRIBUTOR' || association === 'FIRST_TIMER';
}

function renderItem(result: CheckResult): string[] {
  if (result.status === 'pass') {
    return [`- [x] **${result.title}**`];
  }
  const lines = [`- [ ] **${result.title}**: ${result.message}`];
  if (result.howToFix !== '') {
    lines.push(`  - _How to fix:_ ${result.howToFix}`);
  }
  return lines;
}

export function renderComment(input: RenderInput): string {
  const shown = input.results.filter((result) => result.status !== 'not-applicable');
  const required = shown.filter((result) => result.level === 'required');
  const suggestions = shown.filter((result) => result.level === 'info' && result.status === 'fail');
  const needsAttention = required.some((result) => result.status === 'fail');

  const lines: string[] = [MARKER, '## PR checkup', ''];
  if (input.welcome) {
    lines.push(
      fillTemplate(input.messages.welcome, {
        author: input.authorLogin,
        repo: input.repoFullName,
      }),
      '',
    );
  }
  lines.push(needsAttention ? input.messages.intro : input.messages.all_good, '');
  if (required.length > 0) {
    lines.push(...required.flatMap(renderItem), '');
  }
  if (suggestions.length > 0) {
    lines.push(input.messages.suggestions, '', ...suggestions.flatMap(renderItem), '');
  }
  lines.push(
    '---',
    `<sub>${input.messages.footer} · Powered by <a href="${PROJECT_URL}">pr-checkup</a></sub>`,
  );
  return `${lines.join('\n')}\n`;
}

/** Finds pr-checkup's comment: the first one containing the marker, preferring bot-authored comments. */
export function findStickyComment(comments: IssueComment[]): IssueComment | null {
  const candidates = comments.filter((comment) => comment.body.includes(MARKER));
  return candidates.find((comment) => comment.userType === 'Bot') ?? candidates[0] ?? null;
}

export type CommentAction = 'created' | 'updated' | 'unchanged' | 'skipped' | 'dry-run';

export interface UpsertOptions {
  /** Whether to post a new comment when none exists yet. */
  createIfMissing: boolean;
  dryRun: boolean;
  log: Logger;
}

export interface UpsertResult {
  action: CommentAction;
  commentId: number | null;
}

export async function upsertComment(
  api: GitHubApi,
  number: number,
  body: string,
  options: UpsertOptions,
): Promise<UpsertResult> {
  const { log } = options;
  const existing = findStickyComment(await api.listIssueComments(number));

  if (existing !== null) {
    if (existing.body === body) {
      log.info(`The pr-checkup comment (${existing.id}) is already up to date.`);
      return { action: 'unchanged', commentId: existing.id };
    }
    if (options.dryRun) {
      log.info(`[dry-run] Would update the pr-checkup comment (${existing.id}).`);
      return { action: 'dry-run', commentId: existing.id };
    }
    try {
      await api.updateComment(existing.id, body);
      log.info(`Updated the pr-checkup comment (${existing.id}).`);
      return { action: 'updated', commentId: existing.id };
    } catch (error) {
      const status = httpStatus(error);
      if (status !== 403 && status !== 404) throw error;
      log.warning(
        `Could not update comment ${existing.id} (HTTP ${status}); posting a new comment instead.`,
      );
    }
  } else if (!options.createIfMissing) {
    log.info('Everything passed and there is no earlier comment, so no comment was posted.');
    return { action: 'skipped', commentId: null };
  }

  if (options.dryRun) {
    log.info('[dry-run] Would post a new pr-checkup comment.');
    return { action: 'dry-run', commentId: null };
  }
  const commentId = await api.createComment(number, body);
  log.info(`Posted the pr-checkup comment (${commentId}).`);
  return { action: 'created', commentId };
}
