import { describe, expect, it, vi } from 'vitest';
import { createGitHubApi, httpStatus, type Octokit } from '../src/github.js';

function httpError(status: number): Error {
  return Object.assign(new Error(`HTTP ${status}`), { status });
}

function mockOctokit() {
  const mock = {
    rest: {
      pulls: { get: vi.fn(), listFiles: vi.fn() },
      repos: { getContent: vi.fn() },
      search: { issuesAndPullRequests: vi.fn() },
      issues: {
        listComments: vi.fn(),
        createComment: vi.fn(),
        updateComment: vi.fn(),
        getLabel: vi.fn(),
        createLabel: vi.fn(),
        addLabels: vi.fn(),
        removeLabel: vi.fn(),
      },
    },
    paginate: Object.assign(vi.fn(), { iterator: vi.fn() }),
  };
  const api = createGitHubApi(mock as unknown as Octokit, 'octo-org', 'widgets');
  return { mock, api };
}

describe('createGitHubApi', () => {
  it('maps a pull request and fills in missing values', async () => {
    const { mock, api } = mockOctokit();
    mock.rest.pulls.get.mockResolvedValue({
      data: {
        number: 7,
        title: 'T',
        body: null,
        state: 'open',
        draft: undefined,
        user: { login: 'alice', type: 'User' },
        author_association: 'SOMETHING_NEW',
        base: { ref: 'main', sha: 'b1' },
        head: { sha: 'h1' },
        additions: 3,
        deletions: 1,
        changed_files: 2,
        labels: [{ name: 'bug' }],
      },
    });
    expect(await api.getPull(7)).toEqual({
      number: 7,
      title: 'T',
      body: '',
      state: 'open',
      draft: false,
      authorLogin: 'alice',
      authorType: 'User',
      authorAssociation: 'NONE',
      baseRef: 'main',
      baseSha: 'b1',
      headSha: 'h1',
      additions: 3,
      deletions: 1,
      changedFiles: 2,
      labels: ['bug'],
    });
    expect(mock.rest.pulls.get).toHaveBeenCalledWith({
      owner: 'octo-org',
      repo: 'widgets',
      pull_number: 7,
    });
  });

  it('stops paginating files once maxFiles is reached', async () => {
    const { mock, api } = mockOctokit();
    let pagesRead = 0;
    const page = (start: number) => ({
      data: Array.from({ length: 100 }, (_, i) => ({
        filename: `f${start + i}.ts`,
        status: 'modified',
        additions: 1,
        deletions: 0,
        changes: 1,
      })),
    });
    mock.paginate.iterator.mockReturnValue(
      (async function* () {
        for (let start = 0; start < 500; start += 100) {
          pagesRead++;
          yield page(start);
        }
      })(),
    );
    const files = await api.listPullFiles(7, 150);
    expect(files).toHaveLength(150);
    expect(pagesRead).toBe(2);
    expect(files[0]).toEqual({
      filename: 'f0.ts',
      status: 'modified',
      additions: 1,
      deletions: 0,
      changes: 1,
    });
  });

  it('decodes base64 file content', async () => {
    const { mock, api } = mockOctokit();
    mock.rest.repos.getContent.mockResolvedValue({
      data: {
        type: 'file',
        encoding: 'base64',
        content: Buffer.from('hello: world').toString('base64'),
      },
    });
    expect(await api.getFileContent('.github/pr-checkup.yml', 'main')).toBe('hello: world');
    expect(mock.rest.repos.getContent).toHaveBeenCalledWith({
      owner: 'octo-org',
      repo: 'widgets',
      path: '.github/pr-checkup.yml',
      ref: 'main',
    });
  });

  it('returns null for missing files and directories, and rethrows other errors', async () => {
    const { mock, api } = mockOctokit();
    mock.rest.repos.getContent.mockRejectedValueOnce(httpError(404));
    expect(await api.getFileContent('missing.md', 'main')).toBeNull();
    mock.rest.repos.getContent.mockResolvedValueOnce({ data: [] });
    expect(await api.getFileContent('docs', 'main')).toBeNull();
    mock.rest.repos.getContent.mockRejectedValueOnce(httpError(500));
    await expect(api.getFileContent('x', 'main')).rejects.toThrow('HTTP 500');
  });

  it('counts recent PRs with a single search request', async () => {
    const { mock, api } = mockOctokit();
    mock.rest.search.issuesAndPullRequests.mockResolvedValue({ data: { total_count: 12 } });
    expect(await api.countRecentPullRequests('alice', '2026-10-16T12:00:00Z')).toBe(12);
    expect(mock.rest.search.issuesAndPullRequests).toHaveBeenCalledWith({
      q: 'is:pr author:alice created:>=2026-10-16T12:00:00Z',
      per_page: 1,
    });
  });

  it('maps comments, tolerating deleted users', async () => {
    const { mock, api } = mockOctokit();
    mock.paginate.mockResolvedValue([
      { id: 1, body: 'hi', user: { login: 'a', type: 'User' } },
      { id: 2, body: undefined, user: null },
    ]);
    expect(await api.listIssueComments(7)).toEqual([
      { id: 1, body: 'hi', userLogin: 'a', userType: 'User' },
      { id: 2, body: '', userLogin: '', userType: '' },
    ]);
  });

  it('checks whether a label exists', async () => {
    const { mock, api } = mockOctokit();
    mock.rest.issues.getLabel.mockResolvedValueOnce({ data: {} });
    expect(await api.labelExists('x')).toBe(true);
    mock.rest.issues.getLabel.mockRejectedValueOnce(httpError(404));
    expect(await api.labelExists('x')).toBe(false);
  });

  it('tolerates 422 when creating a label that already exists', async () => {
    const { mock, api } = mockOctokit();
    mock.rest.issues.createLabel.mockRejectedValueOnce(httpError(422));
    await expect(api.createLabel('x', 'fbca04', 'd')).resolves.toBeUndefined();
    mock.rest.issues.createLabel.mockRejectedValueOnce(httpError(500));
    await expect(api.createLabel('x', 'fbca04', 'd')).rejects.toThrow('HTTP 500');
  });

  it('tolerates 404 when removing a label that is not on the PR', async () => {
    const { mock, api } = mockOctokit();
    mock.rest.issues.removeLabel.mockRejectedValueOnce(httpError(404));
    await expect(api.removeLabel(7, 'x')).resolves.toBeUndefined();
  });

  it('creates and updates comments', async () => {
    const { mock, api } = mockOctokit();
    mock.rest.issues.createComment.mockResolvedValue({ data: { id: 99 } });
    expect(await api.createComment(7, 'body')).toBe(99);
    await api.updateComment(99, 'new');
    expect(mock.rest.issues.updateComment).toHaveBeenCalledWith({
      owner: 'octo-org',
      repo: 'widgets',
      comment_id: 99,
      body: 'new',
    });
  });
});

describe('httpStatus', () => {
  it('reads a numeric status and ignores everything else', () => {
    expect(httpStatus(httpError(404))).toBe(404);
    expect(httpStatus(new Error('x'))).toBeUndefined();
    expect(httpStatus('nope')).toBeUndefined();
  });
});
