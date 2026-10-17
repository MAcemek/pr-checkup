export const AUTHOR_ASSOCIATIONS = [
  'COLLABORATOR',
  'CONTRIBUTOR',
  'FIRST_TIMER',
  'FIRST_TIME_CONTRIBUTOR',
  'MANNEQUIN',
  'MEMBER',
  'NONE',
  'OWNER',
] as const;

export type AuthorAssociation = (typeof AUTHOR_ASSOCIATIONS)[number];

export const CHECK_IDS = [
  'linked-issue',
  'template-filled',
  'description',
  'tests-included',
  'unrelated-files',
  'diff-size',
  'pr-burst',
] as const;

export type CheckId = (typeof CHECK_IDS)[number];

export const CHECK_LEVELS = ['required', 'info'] as const;

export type CheckLevel = (typeof CHECK_LEVELS)[number];

export interface PrFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  previousFilename?: string;
}

export interface PullRequestData {
  number: number;
  title: string;
  body: string;
  state: string;
  draft: boolean;
  authorLogin: string;
  authorType: string;
  authorAssociation: AuthorAssociation;
  baseRef: string;
  baseSha: string;
  headSha: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  labels: string[];
}

export interface IssueComment {
  id: number;
  body: string;
  userLogin: string;
  userType: string;
}

export interface PrContext {
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string;
  authorLogin: string;
  authorAssociation: AuthorAssociation;
  additions: number;
  deletions: number;
  changedFiles: number;
  files: PrFile[];
  filesTruncated: boolean;
  template: string | null;
  recentPrCount: number | null;
}

export type CheckStatus = 'pass' | 'fail' | 'not-applicable';

export type TemplateVars = Record<string, string | number>;

export interface CheckOutcome {
  status: CheckStatus;
  message: string;
  howToFix: string;
  vars: TemplateVars;
}

export interface CheckResult extends CheckOutcome {
  id: CheckId;
  title: string;
  level: CheckLevel;
}

export interface Logger {
  info(message: string): void;
  warning(message: string): void;
  debug(message: string): void;
}
