# Contributing to pr-checkup

Thanks for helping! pr-checkup exists to make open source friendlier, so please be kind in
issues, reviews and code.

## Setup

You need Node.js 24 (see `.nvmrc`).

```bash
npm ci
npm run all
```

`npm run all` runs the format check, lint, type check, tests and build, which is the same as CI.

| Script              | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| `npm test`          | Runs the unit tests with Vitest.                          |
| `npm run lint`      | Runs ESLint.                                              |
| `npm run format`    | Formats everything with Prettier.                         |
| `npm run typecheck` | Type-checks with `tsc` (no output files).                 |
| `npm run build`     | Bundles `src/` into `dist/index.js` with `@vercel/ncc`.   |
| `npm run dry-run`   | Runs the whole action offline against a recorded fixture. |

## Committing `dist/`

GitHub runs the bundled `dist/index.js`, so it is committed. After changing anything in `src/`,
run `npm run build` and commit `dist/` together with your change. CI fails if `dist/` is out
of date.

## How the code is organised

- `src/index.ts`: entry point; reads inputs and wires up the real GitHub client.
- `src/main.ts`: orchestration (`runAction`), written against interfaces so tests can fake them.
- `src/github.ts`: the only file that talks to the GitHub API (`GitHubApi`).
- `src/context.ts`: fetches everything the checks need, once.
- `src/checks/`: one pure function per check, plus the registry in `index.ts`.
- `src/comment.ts`, `src/labels.ts`, `src/summary.ts`: output.
- `src/config.ts`: defaults, validation and loading of `.github/pr-checkup.yml`.

## Adding a check

1. Add the ID to `CHECK_IDS` in `src/types.ts`.
2. Add its config interface, default values and schema entry in `src/config.ts`.
3. Write `src/checks/<id>.ts` exporting a pure `run…(ctx, config)` function that returns
   `pass(...)`, `fail(...)` or `notApplicable(...)`.
4. Register it in `CHECK_RUNNERS` and `CHECK_TITLES` in `src/checks/index.ts`.
5. Add `test/checks/<id>.test.ts` with passing and failing cases.
6. Document it in `README.md` and `examples/pr-checkup.yml`.

Messages are read by people who may be contributing for the first time. Keep them specific,
friendly and actionable: say what's missing and how to fix it.

## Pull requests

Fill in the PR template, link the issue you're fixing, and include tests. pr-checkup runs on
its own pull requests, so you'll see exactly what your contributors will see.
