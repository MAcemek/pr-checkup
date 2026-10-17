import type * as github from '@actions/github';
import {
  AUTHOR_ASSOCIATIONS,
  type AuthorAssociation,
  type IssueComment,
  type PrFile,
  type PullRequestData,
} from './types.js';

export type Octokit = ReturnType<typeof github.getOctokit>;

/**
 * Every GitHub API call pr-checkup makes goes through this interface.
 * The rest of the code depends only on it, so tests can use an in-memory fake.
 */
export interface GitHubApi {
  getPull(number: number): Promise<PullRequestData>;
  listPullFiles(number: number, maxFiles: number): Promise<PrFile[]>;
  /** Returns null when the file does not exist (404), is a directory, or is not base64 encoded. */
  getFileContent(path: string, ref: string): Promise<string | null>;
  countRecentPullRequests(login: string, sinceIso: string): Promise<number>;
  listIssueComments(number: number): Promise<IssueComment[]>;
  createComment(number: number, body: string): Promise<number>;
  updateComment(commentId: number, body: string): Promise<void>;
  labelExists(name: string): Promise<boolean>;
  /** Creates a repository label. Treats 422 (already exists) as success. */
  createLabel(name: string, color: string, description: string): Promise<void>;
  addLabel(number: number, name: string): Promise<void>;
  /** Removes a label from an issue/PR. Treats 404 (not on the PR) as success. */
  removeLabel(number: number, name: string): Promise<void>;
}

export function httpStatus(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = error.status;
    return typeof status === 'number' ? status : undefined;
  }
  return undefined;
}

function toAssociation(value: string): AuthorAssociation {
  return (AUTHOR_ASSOCIATIONS as readonly string[]).includes(value)
    ? (value as AuthorAssociation)
    : 'NONE';
}

export function createGitHubApi(octokit: Octokit, owner: string, repo: string): GitHubApi {
  return {
    async getPull(number) {
      const { data } = await octokit.rest.pulls.get({ owner, repo, pull_number: number });
      return {
        number: data.number,
        title: data.title,
        body: data.body ?? '',
        state: data.state,
        draft: data.draft ?? false,
        authorLogin: data.user.login,
        authorType: data.user.type,
        authorAssociation: toAssociation(data.author_association),
        baseRef: data.base.ref,
        baseSha: data.base.sha,
        headSha: data.head.sha,
        additions: data.additions,
        deletions: data.deletions,
        changedFiles: data.changed_files,
        labels: data.labels.map((label) => label.name),
      };
    },

    async listPullFiles(number, maxFiles) {
      const files: PrFile[] = [];
      const iterator = octokit.paginate.iterator(octokit.rest.pulls.listFiles, {
        owner,
        repo,
        pull_number: number,
        per_page: 100,
      });
      for await (const page of iterator) {
        for (const file of page.data) {
          files.push({
            filename: file.filename,
            status: file.status,
            additions: file.additions,
            deletions: file.deletions,
            changes: file.changes,
            ...(file.patch !== undefined ? { patch: file.patch } : {}),
            ...(file.previous_filename !== undefined
              ? { previousFilename: file.previous_filename }
              : {}),
          });
        }
        if (files.length >= maxFiles) break;
      }
      return files.slice(0, maxFiles);
    },

    async getFileContent(path, ref) {
      try {
        const { data } = await octokit.rest.repos.getContent({ owner, repo, path, ref });
        if (Array.isArray(data) || data.type !== 'file' || !('content' in data)) return null;
        if (data.encoding !== 'base64') return null;
        return Buffer.from(data.content, 'base64').toString('utf8');
      } catch (error) {
        if (httpStatus(error) === 404) return null;
        throw error;
      }
    },

    async countRecentPullRequests(login, sinceIso) {
      const { data } = await octokit.rest.search.issuesAndPullRequests({
        q: `is:pr author:${login} created:>=${sinceIso}`,
        per_page: 1,
      });
      return data.total_count;
    },

    async listIssueComments(number) {
      const comments = await octokit.paginate(octokit.rest.issues.listComments, {
        owner,
        repo,
        issue_number: number,
        per_page: 100,
      });
      return comments.map((comment) => ({
        id: comment.id,
        body: comment.body ?? '',
        userLogin: comment.user?.login ?? '',
        userType: comment.user?.type ?? '',
      }));
    },

    async createComment(number, body) {
      const { data } = await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: number,
        body,
      });
      return data.id;
    },

    async updateComment(commentId, body) {
      await octokit.rest.issues.updateComment({ owner, repo, comment_id: commentId, body });
    },

    async labelExists(name) {
      try {
        await octokit.rest.issues.getLabel({ owner, repo, name });
        return true;
      } catch (error) {
        if (httpStatus(error) === 404) return false;
        throw error;
      }
    },

    async createLabel(name, color, description) {
      try {
        await octokit.rest.issues.createLabel({ owner, repo, name, color, description });
      } catch (error) {
        if (httpStatus(error) === 422) return;
        throw error;
      }
    },

    async addLabel(number, name) {
      await octokit.rest.issues.addLabels({ owner, repo, issue_number: number, labels: [name] });
    },

    async removeLabel(number, name) {
      try {
        await octokit.rest.issues.removeLabel({ owner, repo, issue_number: number, name });
      } catch (error) {
        if (httpStatus(error) === 404) return;
        throw error;
      }
    },
  };
}
