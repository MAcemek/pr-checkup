/**
 * Runs pr-checkup end to end against a recorded scenario, fully offline.
 *
 *   npm run dry-run                                              # default scenario
 *   npm run dry-run -- test/fixtures/scenarios/all-good.json     # any scenario file
 *
 * Uses the in-memory FakeGitHubApi, so nothing is sent to GitHub. Exits with code 1
 * if the run tried to write anything (dry-run must be read-only) or threw.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runAction } from '../src/main.js';
import { FakeGitHubApi, type Scenario } from '../test/helpers/fake-api.js';

const scenarioPath = resolve(process.argv[2] ?? 'test/fixtures/scenarios/needs-attention.json');
const scenario = JSON.parse(readFileSync(scenarioPath, 'utf8')) as Scenario;
const api = new FakeGitHubApi(scenario);

console.log(`Scenario: ${scenarioPath}\n${scenario.description}\n`);

const result = await runAction({
  inputs: {
    githubToken: 'dry-run-token',
    configPath: '.github/pr-checkup.yml',
    label: 'needs-author-attention',
    failOnIssues: false,
    dryRun: true,
  },
  eventName: scenario.eventName,
  prNumber: scenario.pull.number,
  repo: scenario.repo,
  api,
  log: {
    info: (message) => console.log(message),
    warning: (message) => console.log(`warning: ${message}`),
    debug: () => undefined,
  },
  now: new Date(scenario.now),
  writeSummary: async (markdown) => {
    console.log(`\n----- job summary -----\n${markdown}`);
  },
  setOutput: (name, value) => console.log(`output ${name}=${value}`),
  setFailed: (message) => {
    console.log(`FAILED: ${message}`);
    process.exitCode = 1;
  },
});

console.log(`\nOutcome: ${result.outcome}`);
if (api.writes.length > 0) {
  console.error(`Dry run attempted writes: ${JSON.stringify(api.writes)}`);
  process.exitCode = 1;
}
