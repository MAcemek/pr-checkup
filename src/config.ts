import { parse } from 'yaml';
import type { GitHubApi } from './github.js';
import {
  AUTHOR_ASSOCIATIONS,
  CHECK_LEVELS,
  type AuthorAssociation,
  type CheckLevel,
  type Logger,
} from './types.js';

export interface BaseCheckConfig {
  enabled: boolean;
  level: CheckLevel;
  message: string | null;
  how_to_fix: string | null;
}

export interface LinkedIssueConfig extends BaseCheckConfig {
  require_keyword: boolean;
  extra_patterns: string[];
}

export interface TemplateFilledConfig extends BaseCheckConfig {
  template_paths: string[];
  min_added_chars: number;
  required_sections: string[];
  require_checked_box: boolean;
}

export interface DescriptionConfig extends BaseCheckConfig {
  min_length: number;
}

export interface TestsIncludedConfig extends BaseCheckConfig {
  source_globs: string[];
  test_globs: string[];
  ignore: string[];
}

export interface UnrelatedFilesConfig extends BaseCheckConfig {
  lockfiles: Record<string, string>;
  generated_globs: string[];
  whitespace_only: boolean;
}

export interface DiffSizeConfig extends BaseCheckConfig {
  max_files: number;
  max_lines: number;
  ignore: string[];
}

export interface PrBurstConfig extends BaseCheckConfig {
  max_prs: number;
  window_hours: number;
}

export interface ChecksConfig {
  'linked-issue': LinkedIssueConfig;
  'template-filled': TemplateFilledConfig;
  description: DescriptionConfig;
  'tests-included': TestsIncludedConfig;
  'unrelated-files': UnrelatedFilesConfig;
  'diff-size': DiffSizeConfig;
  'pr-burst': PrBurstConfig;
}

export interface SkipConfig {
  drafts: boolean;
  bots: boolean;
  author_associations: AuthorAssociation[];
  authors: string[];
  labels: string[];
}

export interface CommentConfig {
  post_when_passing: boolean;
  welcome_first_timers: boolean;
}

export interface MessagesConfig {
  welcome: string;
  intro: string;
  all_good: string;
  suggestions: string;
  footer: string;
}

export interface Config {
  skip: SkipConfig;
  comment: CommentConfig;
  messages: MessagesConfig;
  checks: ChecksConfig;
}

export const DEFAULT_CONFIG: Config = {
  skip: {
    drafts: true,
    bots: true,
    author_associations: ['OWNER', 'MEMBER', 'COLLABORATOR'],
    authors: [],
    labels: ['skip-checkup'],
  },
  comment: {
    post_when_passing: false,
    welcome_first_timers: true,
  },
  messages: {
    welcome: 'Welcome, @{author}, and thank you for your first contribution to {repo}!',
    intro:
      'Thanks for opening this pull request! I ran a quick checkup and found a few things that would help maintainers review it faster:',
    all_good:
      'Everything looks good. Thanks for making this easy to review! A maintainer will take a look soon.',
    suggestions: "**Suggestions** (optional, these won't add a label):",
    footer:
      'Nothing here closes or blocks your PR. I re-check automatically whenever you push or edit the description, and this comment updates itself.',
  },
  checks: {
    'linked-issue': {
      enabled: true,
      level: 'required',
      message: null,
      how_to_fix: null,
      require_keyword: false,
      extra_patterns: [],
    },
    'template-filled': {
      enabled: true,
      level: 'required',
      message: null,
      how_to_fix: null,
      template_paths: [
        '.github/pull_request_template.md',
        '.github/PULL_REQUEST_TEMPLATE.md',
        'pull_request_template.md',
        'PULL_REQUEST_TEMPLATE.md',
        'docs/pull_request_template.md',
        'docs/PULL_REQUEST_TEMPLATE.md',
      ],
      min_added_chars: 20,
      required_sections: [],
      require_checked_box: true,
    },
    description: {
      enabled: true,
      level: 'required',
      message: null,
      how_to_fix: null,
      min_length: 30,
    },
    'tests-included': {
      enabled: true,
      level: 'required',
      message: null,
      how_to_fix: null,
      source_globs: ['src/**', 'lib/**', 'app/**', 'pkg/**', 'internal/**', 'cmd/**'],
      test_globs: [
        '**/test/**',
        '**/tests/**',
        '**/__tests__/**',
        '**/spec/**',
        '**/*.test.*',
        '**/*.spec.*',
        '**/*_test.*',
        '**/test_*.*',
        '**/*Test.*',
        '**/*Tests.*',
      ],
      ignore: [
        '**/*.md',
        '**/*.txt',
        '**/*.json',
        '**/*.yml',
        '**/*.yaml',
        '**/*.css',
        '**/*.svg',
        '**/*.png',
        '**/*.jpg',
        '**/*.gif',
      ],
    },
    'unrelated-files': {
      enabled: true,
      level: 'required',
      message: null,
      how_to_fix: null,
      lockfiles: {
        'package-lock.json': 'package.json',
        'npm-shrinkwrap.json': 'package.json',
        'yarn.lock': 'package.json',
        'pnpm-lock.yaml': 'package.json',
        'bun.lock': 'package.json',
        'Cargo.lock': 'Cargo.toml',
        'poetry.lock': 'pyproject.toml',
        'uv.lock': 'pyproject.toml',
        'Pipfile.lock': 'Pipfile',
        'Gemfile.lock': 'Gemfile',
        'composer.lock': 'composer.json',
        'go.sum': 'go.mod',
      },
      generated_globs: [
        'dist/**',
        'build/**',
        'vendor/**',
        'node_modules/**',
        '**/*.min.js',
        '**/*.min.css',
      ],
      whitespace_only: true,
    },
    'diff-size': {
      enabled: true,
      level: 'info',
      message: null,
      how_to_fix: null,
      max_files: 30,
      max_lines: 800,
      ignore: [
        '**/package-lock.json',
        '**/npm-shrinkwrap.json',
        '**/yarn.lock',
        '**/pnpm-lock.yaml',
        '**/bun.lock',
        '**/Cargo.lock',
        '**/poetry.lock',
        '**/uv.lock',
        '**/Gemfile.lock',
        '**/composer.lock',
        '**/go.sum',
        '**/*.snap',
        'dist/**',
      ],
    },
    'pr-burst': {
      enabled: false,
      level: 'info',
      message: null,
      how_to_fix: null,
      max_prs: 10,
      window_hours: 24,
    },
  },
};

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

type FieldSpec =
  | { kind: 'boolean' }
  | { kind: 'integer'; min: number }
  | { kind: 'string' }
  | { kind: 'nullable-string' }
  | { kind: 'string-array' }
  | { kind: 'regex-array' }
  | { kind: 'enum'; values: readonly string[] }
  | { kind: 'enum-array'; values: readonly string[] }
  | { kind: 'string-map' }
  | { kind: 'object'; fields: Record<string, FieldSpec> };

const BOOL: FieldSpec = { kind: 'boolean' };
const STR: FieldSpec = { kind: 'string' };
const NSTR: FieldSpec = { kind: 'nullable-string' };
const STRS: FieldSpec = { kind: 'string-array' };
const INT0: FieldSpec = { kind: 'integer', min: 0 };
const INT1: FieldSpec = { kind: 'integer', min: 1 };

function checkSpec(extra: Record<string, FieldSpec>): FieldSpec {
  return {
    kind: 'object',
    fields: {
      enabled: BOOL,
      level: { kind: 'enum', values: CHECK_LEVELS },
      message: NSTR,
      how_to_fix: NSTR,
      ...extra,
    },
  };
}

export const CONFIG_SCHEMA: FieldSpec = {
  kind: 'object',
  fields: {
    skip: {
      kind: 'object',
      fields: {
        drafts: BOOL,
        bots: BOOL,
        author_associations: { kind: 'enum-array', values: AUTHOR_ASSOCIATIONS },
        authors: STRS,
        labels: STRS,
      },
    },
    comment: {
      kind: 'object',
      fields: { post_when_passing: BOOL, welcome_first_timers: BOOL },
    },
    messages: {
      kind: 'object',
      fields: { welcome: STR, intro: STR, all_good: STR, suggestions: STR, footer: STR },
    },
    checks: {
      kind: 'object',
      fields: {
        'linked-issue': checkSpec({
          require_keyword: BOOL,
          extra_patterns: { kind: 'regex-array' },
        }),
        'template-filled': checkSpec({
          template_paths: STRS,
          min_added_chars: INT0,
          required_sections: STRS,
          require_checked_box: BOOL,
        }),
        description: checkSpec({ min_length: INT0 }),
        'tests-included': checkSpec({ source_globs: STRS, test_globs: STRS, ignore: STRS }),
        'unrelated-files': checkSpec({
          lockfiles: { kind: 'string-map' },
          generated_globs: STRS,
          whitespace_only: BOOL,
        }),
        'diff-size': checkSpec({ max_files: INT1, max_lines: INT1, ignore: STRS }),
        'pr-burst': checkSpec({ max_prs: INT1, window_hours: INT1 }),
      },
    },
  },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'a list';
  if (typeof value === 'object') return 'a mapping';
  return `${typeof value} ${JSON.stringify(value)}`;
}

export function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = prev[j]!;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      prev[j] = Math.min(above + 1, prev[j - 1]! + 1, diagonal + cost);
      diagonal = above;
    }
  }
  return prev[b.length]!;
}

function suggestKey(key: string, candidates: string[]): string {
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = levenshtein(key, candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best !== null && bestDistance <= 3 ? ` Did you mean "${best}"?` : '';
}

function walk(
  spec: FieldSpec,
  raw: unknown,
  fallback: unknown,
  path: string,
  errors: string[],
): unknown {
  if (spec.kind === 'object') {
    const defaults = fallback as Record<string, unknown>;
    if (raw === undefined || raw === null) {
      return structuredClone(defaults);
    }
    if (!isPlainObject(raw)) {
      const where = path === '' ? 'The config file' : `"${path}"`;
      errors.push(`${where} must be a mapping, but got ${describe(raw)}.`);
      return structuredClone(defaults);
    }
    const knownKeys = Object.keys(spec.fields);
    for (const key of Object.keys(raw)) {
      if (!knownKeys.includes(key)) {
        const where = path === '' ? `"${key}"` : `"${path}.${key}"`;
        errors.push(`Unknown key ${where}.${suggestKey(key, knownKeys)}`);
      }
    }
    const result: Record<string, unknown> = {};
    for (const key of knownKeys) {
      const childPath = path === '' ? key : `${path}.${key}`;
      result[key] = walk(spec.fields[key]!, raw[key], defaults[key], childPath, errors);
    }
    return result;
  }

  if (raw === undefined) {
    return structuredClone(fallback);
  }

  switch (spec.kind) {
    case 'boolean':
      if (typeof raw !== 'boolean') {
        errors.push(`"${path}" must be true or false, but got ${describe(raw)}.`);
        return fallback;
      }
      return raw;
    case 'integer':
      if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < spec.min) {
        errors.push(
          `"${path}" must be a whole number of at least ${spec.min}, but got ${describe(raw)}.`,
        );
        return fallback;
      }
      return raw;
    case 'string':
      if (typeof raw !== 'string') {
        errors.push(`"${path}" must be a string, but got ${describe(raw)}.`);
        return fallback;
      }
      return raw;
    case 'nullable-string':
      if (raw !== null && typeof raw !== 'string') {
        errors.push(`"${path}" must be a string, but got ${describe(raw)}.`);
        return fallback;
      }
      return raw;
    case 'string-array':
    case 'regex-array':
    case 'enum-array': {
      if (!Array.isArray(raw) || !raw.every((item) => typeof item === 'string')) {
        errors.push(`"${path}" must be a list of strings, but got ${describe(raw)}.`);
        return structuredClone(fallback);
      }
      const items: string[] = raw;
      if (spec.kind === 'regex-array') {
        for (const item of items) {
          try {
            new RegExp(item);
          } catch {
            errors.push(`"${path}" contains an invalid regular expression: ${item}`);
          }
        }
      }
      if (spec.kind === 'enum-array') {
        for (const item of items) {
          if (!spec.values.includes(item)) {
            errors.push(
              `"${path}" contains "${item}", which is not one of: ${spec.values.join(', ')}.`,
            );
          }
        }
      }
      return [...items];
    }
    case 'enum':
      if (typeof raw !== 'string' || !spec.values.includes(raw)) {
        errors.push(
          `"${path}" must be one of: ${spec.values.join(', ')}, but got ${describe(raw)}.`,
        );
        return fallback;
      }
      return raw;
    case 'string-map':
      if (!isPlainObject(raw) || !Object.values(raw).every((value) => typeof value === 'string')) {
        errors.push(`"${path}" must be a mapping of strings to strings, but got ${describe(raw)}.`);
        return structuredClone(fallback);
      }
      return { ...raw };
  }
}

export function validateAndMerge(raw: unknown, sourceName = 'config'): Config {
  const errors: string[] = [];
  const merged = walk(CONFIG_SCHEMA, raw, DEFAULT_CONFIG, '', errors);
  if (errors.length > 0) {
    throw new ConfigError(
      `Invalid pr-checkup config in ${sourceName}:\n${errors.map((e) => `  - ${e}`).join('\n')}`,
    );
  }
  return merged as Config;
}

export function parseConfig(text: string, sourceName: string): Config {
  let raw: unknown;
  try {
    raw = parse(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`Could not parse ${sourceName} as YAML: ${reason}`);
  }
  return validateAndMerge(raw, sourceName);
}

export async function loadConfig(
  api: GitHubApi,
  configPath: string,
  ref: string,
  log: Logger,
): Promise<Config> {
  const text = await api.getFileContent(configPath, ref);
  if (text === null) {
    log.info(`No config file at ${configPath} on ${ref}; using the default settings.`);
    return structuredClone(DEFAULT_CONFIG);
  }
  log.info(`Loaded config from ${configPath} on ${ref}.`);
  return parseConfig(text, configPath);
}
