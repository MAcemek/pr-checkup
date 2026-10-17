import { runChecks } from './checks/index.js';
import { isFirstTimer, renderComment, upsertComment, type CommentAction } from './comment.js';
import { loadConfig } from './config.js';
import { buildPrContext } from './context.js';
import type { GitHubApi } from './github.js';
import type { ActionInputs } from './inputs.js';
import { syncLabel, type LabelAction } from './labels.js';
import { getSkipReason } from './skip.js';
import { renderSkipSummary, renderSummary } from './summary.js';
import type { CheckResult, Logger } from './types.js';

export const SUPPORTED_EVENTS = ['pull_request_target', 'pull_request'];

export interface ActionEnv {
  inputs: ActionInputs;
  eventName: string;
  /** pull_request.number from the event payload, if any. */
  prNumber: number | undefined;
  repo: { owner: string; repo: string };
  api: GitHubApi;
  log: Logger;
  now: Date;
  writeSummary(markdown: string): Promise<void>;
  setOutput(name: string, value: string): void;
  setFailed(message: string): void;
}

export type RunOutcome = 'ignored' | 'skipped' | 'pass' | 'needs-attention';

export interface RunResult {
  outcome: RunOutcome;
  reason: string | null;
  results: CheckResult[];
  commentBody: string | null;
  commentAction: CommentAction | null;
  labelAction: LabelAction | null;
}

function finishEarly(env: ActionEnv, outcome: RunOutcome, reason: string): RunResult {
  env.setOutput('result', 'skipped');
  env.setOutput('failed-checks', '');
  return {
    outcome,
    reason,
    results: [],
    commentBody: null,
    commentAction: null,
    labelAction: null,
  };
}

export async function runAction(env: ActionEnv): Promise<RunResult> {
  const { inputs, log, api } = env;

  if (!SUPPORTED_EVENTS.includes(env.eventName) || env.prNumber === undefined) {
    const reason = `pr-checkup only runs on pull_request_target or pull_request events (got "${env.eventName}"). Nothing to do.`;
    log.warning(reason);
    return finishEarly(env, 'ignored', reason);
  }

  const pull = await api.getPull(env.prNumber);
  const config = await loadConfig(api, inputs.configPath, pull.baseRef, log);

  const skipReason = getSkipReason(pull, config.skip);
  if (skipReason !== null) {
    log.info(`Skipping PR #${pull.number} because ${skipReason}.`);
    await env.writeSummary(renderSkipSummary(pull.number, skipReason));
    return finishEarly(env, 'skipped', skipReason);
  }

  const ctx = await buildPrContext(api, pull, env.repo, config, env.now, log);
  const results = runChecks(ctx, config);
  const failures = results.filter((result) => result.status === 'fail');
  const requiredFailures = failures.filter((result) => result.level === 'required');

  const body = renderComment({
    results,
    messages: config.messages,
    welcome: config.comment.welcome_first_timers && isFirstTimer(pull.authorAssociation),
    authorLogin: pull.authorLogin,
    repoFullName: `${env.repo.owner}/${env.repo.repo}`,
  });
  if (inputs.dryRun) {
    log.info(`[dry-run] Rendered comment:\n${body}`);
  }

  const comment = await upsertComment(api, pull.number, body, {
    createIfMissing: failures.length > 0 || config.comment.post_when_passing,
    dryRun: inputs.dryRun,
    log,
  });
  const labelAction = await syncLabel(api, pull.number, {
    name: inputs.label,
    shouldHave: requiredFailures.length > 0,
    currentLabels: pull.labels,
    dryRun: inputs.dryRun,
    log,
  });

  await env.writeSummary(
    renderSummary({
      number: pull.number,
      results,
      commentAction: comment.action,
      labelAction,
      dryRun: inputs.dryRun,
    }),
  );

  const outcome: RunOutcome = requiredFailures.length > 0 ? 'needs-attention' : 'pass';
  env.setOutput('result', outcome);
  env.setOutput('failed-checks', failures.map((result) => result.id).join(','));

  if (requiredFailures.length > 0 && inputs.failOnIssues) {
    const message = `pr-checkup found ${requiredFailures.length} thing(s) for the author to look at: ${requiredFailures.map((result) => result.id).join(', ')}.`;
    if (inputs.dryRun) {
      log.info(`[dry-run] Would mark this run as failed: ${message}`);
    } else {
      env.setFailed(message);
    }
  }

  return {
    outcome,
    reason: null,
    results,
    commentBody: body,
    commentAction: comment.action,
    labelAction,
  };
}
