import type { GitHubApi } from '../../src/github.js';
import type { IssueComment, PrFile, PullRequestData } from '../../src/types.js';

/** Shape of the JSON files in test/fixtures/scenarios/. */
export interface Scenario {
  description: string;
  eventName: string;
  /** ISO timestamp used as "now". */
  now: string;
  repo: { owner: string; repo: string };
  pull: PullRequestData;
  files: PrFile[];
  /** File contents on the base branch, keyed by "<ref>:<path>". */
  contents: Record<string, string>;
  comments: IssueComment[];
  /** Labels that already exist in the repository. */
  repoLabels: string[];
  recentPrCount: number;
}

export interface ApiCall {
  method: keyof GitHubApi;
  args: unknown[];
}

const WRITE_METHODS: ReadonlyArray<keyof GitHubApi> = [
  'createComment',
  'updateComment',
  'createLabel',
  'addLabel',
  'removeLabel',
];

function notFound(): Error {
  return Object.assign(new Error('Not Found'), { status: 404 });
}

/** In-memory GitHubApi used by unit tests and by `npm run dry-run`. Never touches the network. */
export class FakeGitHubApi implements GitHubApi {
  readonly calls: ApiCall[] = [];
  readonly pull: PullRequestData;
  readonly files: PrFile[];
  readonly contents: Record<string, string>;
  readonly comments: IssueComment[];
  readonly repoLabels: string[];
  recentPrCount: number;
  /** Set to make countRecentPullRequests throw. */
  searchError: Error | null = null;
  /** Set to make updateComment throw (for example an error with status 403). */
  updateError: Error | null = null;
  private nextCommentId = 9000;

  constructor(scenario: Scenario) {
    const copy = structuredClone(scenario);
    this.pull = copy.pull;
    this.files = copy.files;
    this.contents = copy.contents;
    this.comments = copy.comments;
    this.repoLabels = copy.repoLabels;
    this.recentPrCount = copy.recentPrCount;
  }

  get writes(): ApiCall[] {
    return this.calls.filter((call) => WRITE_METHODS.includes(call.method));
  }

  private record(method: keyof GitHubApi, ...args: unknown[]): void {
    this.calls.push({ method, args });
  }

  async getPull(number: number): Promise<PullRequestData> {
    this.record('getPull', number);
    if (number !== this.pull.number) throw notFound();
    return structuredClone(this.pull);
  }

  async listPullFiles(number: number, maxFiles: number): Promise<PrFile[]> {
    this.record('listPullFiles', number, maxFiles);
    return structuredClone(this.files.slice(0, maxFiles));
  }

  async getFileContent(path: string, ref: string): Promise<string | null> {
    this.record('getFileContent', path, ref);
    return this.contents[`${ref}:${path}`] ?? null;
  }

  async countRecentPullRequests(login: string, sinceIso: string): Promise<number> {
    this.record('countRecentPullRequests', login, sinceIso);
    if (this.searchError !== null) throw this.searchError;
    return this.recentPrCount;
  }

  async listIssueComments(number: number): Promise<IssueComment[]> {
    this.record('listIssueComments', number);
    return structuredClone(this.comments);
  }

  async createComment(number: number, body: string): Promise<number> {
    this.record('createComment', number, body);
    const id = this.nextCommentId++;
    this.comments.push({ id, body, userLogin: 'github-actions[bot]', userType: 'Bot' });
    return id;
  }

  async updateComment(commentId: number, body: string): Promise<void> {
    this.record('updateComment', commentId, body);
    if (this.updateError !== null) throw this.updateError;
    const comment = this.comments.find((c) => c.id === commentId);
    if (comment === undefined) throw notFound();
    comment.body = body;
  }

  async labelExists(name: string): Promise<boolean> {
    this.record('labelExists', name);
    return this.repoLabels.some((label) => label.toLowerCase() === name.toLowerCase());
  }

  async createLabel(name: string, color: string, description: string): Promise<void> {
    this.record('createLabel', name, color, description);
    if (!this.repoLabels.includes(name)) this.repoLabels.push(name);
  }

  async addLabel(number: number, name: string): Promise<void> {
    this.record('addLabel', number, name);
    if (!this.pull.labels.includes(name)) this.pull.labels.push(name);
  }

  async removeLabel(number: number, name: string): Promise<void> {
    this.record('removeLabel', number, name);
    const index = this.pull.labels.indexOf(name);
    if (index !== -1) this.pull.labels.splice(index, 1);
  }
}
