import { describe, expect, it } from 'vitest';
import {
  findStickyComment,
  isFirstTimer,
  MARKER,
  renderComment,
  upsertComment,
  type RenderInput,
} from '../src/comment.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import type { CheckResult, IssueComment } from '../src/types.js';
import { FakeGitHubApi } from './helpers/fake-api.js';
import { loadScenario, makeLogger } from './helpers/factories.js';

function result(overrides: Partial<CheckResult> & Pick<CheckResult, 'id' | 'title'>): CheckResult {
  return {
    status: 'pass',
    level: 'required',
    message: 'ok',
    howToFix: '',
    vars: {},
    ...overrides,
  };
}

const FAILING: CheckResult[] = [
  result({ id: 'linked-issue', title: 'Linked issue' }),
  result({
    id: 'description',
    title: 'Description',
    status: 'fail',
    message: 'The description is empty.',
    howToFix: 'Add a few sentences about what this PR changes and why.',
  }),
  result({ id: 'template-filled', title: 'PR template filled in', status: 'not-applicable' }),
  result({
    id: 'diff-size',
    title: 'Reviewable size',
    level: 'info',
    status: 'fail',
    message: 'This PR changes 1,200 lines across 3 files.',
    howToFix: 'Consider splitting it.',
  }),
];

const PASSING: CheckResult[] = [
  result({ id: 'linked-issue', title: 'Linked issue' }),
  result({ id: 'description', title: 'Description' }),
  result({ id: 'diff-size', title: 'Reviewable size', level: 'info' }),
];

function input(results: CheckResult[], welcome = false): RenderInput {
  return {
    results,
    messages: DEFAULT_CONFIG.messages,
    welcome,
    authorLogin: 'eager-newcomer',
    repoFullName: 'octo-org/widgets',
  };
}

describe('renderComment', () => {
  it('renders the needs-attention comment', async () => {
    await expect(renderComment(input(FAILING, true))).toMatchFileSnapshot(
      './__snapshots__/comment-needs-attention.md',
    );
  });

  it('renders the all-good comment', async () => {
    await expect(renderComment(input(PASSING))).toMatchFileSnapshot(
      './__snapshots__/comment-all-good.md',
    );
  });

  it('starts with the hidden marker', () => {
    expect(renderComment(input(PASSING)).split('\n')[0]).toBe(MARKER);
  });

  it('only greets first-time contributors when asked to', () => {
    const greeting =
      '👋 Welcome, @eager-newcomer, and thank you for your first contribution to octo-org/widgets!';
    expect(renderComment(input(PASSING, true))).toContain(greeting);
    expect(renderComment(input(PASSING, false))).not.toContain('Welcome');
  });

  it('uses the intro when a required check fails and lists how to fix it', () => {
    const body = renderComment(input(FAILING));
    expect(body).toContain(DEFAULT_CONFIG.messages.intro);
    expect(body).toContain('- ⬜ **Description**: The description is empty.');
    expect(body).toContain(
      '  - _How to fix:_ Add a few sentences about what this PR changes and why.',
    );
    expect(body).toContain('- ✅ **Linked issue**');
  });

  it('hides not-applicable checks', () => {
    expect(renderComment(input(FAILING))).not.toContain('PR template filled in');
  });

  it('shows failing info checks under Suggestions and hides passing ones', () => {
    expect(renderComment(input(FAILING))).toContain(
      `${DEFAULT_CONFIG.messages.suggestions}\n\n- ⬜ **Reviewable size**`,
    );
    expect(renderComment(input(PASSING))).not.toContain('Reviewable size');
  });

  it('says all good when only suggestions fail', () => {
    const onlyInfo = FAILING.filter((r) => r.id !== 'description');
    const body = renderComment(input(onlyInfo));
    expect(body).toContain(DEFAULT_CONFIG.messages.all_good);
    expect(body).toContain('Reviewable size');
  });

  it('omits the how-to-fix line when there is no fix text', () => {
    const body = renderComment(
      input([result({ id: 'description', title: 'Description', status: 'fail', message: 'x' })]),
    );
    expect(body).not.toContain('How to fix');
  });
});

describe('isFirstTimer', () => {
  it('recognises both first-timer associations', () => {
    expect(isFirstTimer('FIRST_TIME_CONTRIBUTOR')).toBe(true);
    expect(isFirstTimer('FIRST_TIMER')).toBe(true);
    expect(isFirstTimer('CONTRIBUTOR')).toBe(false);
  });
});

describe('findStickyComment', () => {
  const human: IssueComment = { id: 1, body: 'hello', userLogin: 'a', userType: 'User' };
  const quoted: IssueComment = { id: 2, body: `> ${MARKER}`, userLogin: 'b', userType: 'User' };
  const bot: IssueComment = {
    id: 3,
    body: `${MARKER}\nold`,
    userLogin: 'github-actions[bot]',
    userType: 'Bot',
  };

  it('returns null when there is no marker', () => {
    expect(findStickyComment([human])).toBeNull();
  });

  it('prefers a bot-authored comment', () => {
    expect(findStickyComment([human, quoted, bot])?.id).toBe(3);
  });

  it('falls back to the first comment with the marker (for PAT users)', () => {
    expect(findStickyComment([human, quoted])?.id).toBe(2);
  });
});

describe('upsertComment', () => {
  function apiWith(comments: IssueComment[]): FakeGitHubApi {
    const scenario = loadScenario('needs-attention');
    scenario.comments = comments;
    return new FakeGitHubApi(scenario);
  }
  const existing: IssueComment = {
    id: 555,
    body: `${MARKER}\nold`,
    userLogin: 'github-actions[bot]',
    userType: 'Bot',
  };
  const body = `${MARKER}\nnew\n`;

  it('creates a comment when none exists and createIfMissing is true', async () => {
    const api = apiWith([]);
    const res = await upsertComment(api, 101, body, {
      createIfMissing: true,
      dryRun: false,
      log: makeLogger(),
    });
    expect(res).toEqual({ action: 'created', commentId: 9000 });
    expect(api.writes).toEqual([{ method: 'createComment', args: [101, body] }]);
  });

  it('does not post when none exists and createIfMissing is false', async () => {
    const api = apiWith([]);
    const res = await upsertComment(api, 101, body, {
      createIfMissing: false,
      dryRun: false,
      log: makeLogger(),
    });
    expect(res).toEqual({ action: 'skipped', commentId: null });
    expect(api.writes).toEqual([]);
  });

  it('updates the existing comment, even when createIfMissing is false', async () => {
    const api = apiWith([existing]);
    const res = await upsertComment(api, 101, body, {
      createIfMissing: false,
      dryRun: false,
      log: makeLogger(),
    });
    expect(res).toEqual({ action: 'updated', commentId: 555 });
    expect(api.writes).toEqual([{ method: 'updateComment', args: [555, body] }]);
  });

  it('leaves an identical comment alone', async () => {
    const api = apiWith([{ ...existing, body }]);
    const res = await upsertComment(api, 101, body, {
      createIfMissing: true,
      dryRun: false,
      log: makeLogger(),
    });
    expect(res.action).toBe('unchanged');
    expect(api.writes).toEqual([]);
  });

  it('never writes in dry-run mode', async () => {
    const withComment = apiWith([existing]);
    const empty = apiWith([]);
    const opts = { createIfMissing: true, dryRun: true, log: makeLogger() };
    expect((await upsertComment(withComment, 101, body, opts)).action).toBe('dry-run');
    expect((await upsertComment(empty, 101, body, opts)).action).toBe('dry-run');
    expect([...withComment.writes, ...empty.writes]).toEqual([]);
  });

  it('posts a new comment when the old one cannot be edited (403)', async () => {
    const api = apiWith([existing]);
    api.updateError = Object.assign(new Error('Forbidden'), { status: 403 });
    const log = makeLogger();
    const res = await upsertComment(api, 101, body, { createIfMissing: false, dryRun: false, log });
    expect(res.action).toBe('created');
    expect(log.lines.some((line) => line.startsWith('warning:'))).toBe(true);
  });

  it('rethrows other errors', async () => {
    const api = apiWith([existing]);
    api.updateError = Object.assign(new Error('Server error'), { status: 500 });
    await expect(
      upsertComment(api, 101, body, { createIfMissing: true, dryRun: false, log: makeLogger() }),
    ).rejects.toThrow('Server error');
  });
});
