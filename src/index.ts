import * as core from '@actions/core';
import * as github from '@actions/github';
import { createGitHubApi } from './github.js';
import { readInputs } from './inputs.js';
import { runAction } from './main.js';

async function main(): Promise<void> {
  try {
    const inputs = readInputs((name) => core.getInput(name));
    if (inputs.githubToken === '') {
      throw new Error('The github-token input is empty.');
    }
    const octokit = github.getOctokit(inputs.githubToken);
    const { owner, repo } = github.context.repo;
    const prNumber = github.context.payload.pull_request?.number;
    await runAction({
      inputs,
      eventName: github.context.eventName,
      prNumber: typeof prNumber === 'number' ? prNumber : undefined,
      repo: { owner, repo },
      api: createGitHubApi(octokit, owner, repo),
      log: {
        info: (message) => core.info(message),
        warning: (message) => core.warning(message),
        debug: (message) => core.debug(message),
      },
      now: new Date(),
      writeSummary: async (markdown) => {
        try {
          await core.summary.addRaw(markdown).write();
        } catch (error) {
          core.warning(`Could not write the job summary: ${String(error)}`);
        }
      },
      setOutput: (name, value) => core.setOutput(name, value),
      setFailed: (message) => core.setFailed(message),
    });
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

await main();
