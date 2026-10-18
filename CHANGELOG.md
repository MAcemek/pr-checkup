# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-10-18

### Changed

- The PR comment and job summary use plain text and GitHub task-list checkboxes instead of emoji.

## [0.1.0] - 2026-10-17

### Added

- First release of pr-checkup, a gentle PR triage GitHub Action that never closes PRs.
- One sticky checklist comment per PR, edited in place, with a welcome line for first-time contributors.
- A `needs-author-attention` label that is added when a required check fails and removed once everything passes.
- Checks: `linked-issue`, `template-filled`, `description`, `tests-included`, `unrelated-files`, `diff-size` (suggestion) and `pr-burst` (suggestion, off by default).
- Optional `.github/pr-checkup.yml` config, read from the base branch, with validation and per-check message overrides.
- Skips bots, drafts, owners, members and collaborators, an author allow-list and a `skip-checkup` label.
- Job summary, `result` and `failed-checks` outputs, `fail-on-issues` and `dry-run` inputs.
- Offline `npm run dry-run` against recorded fixtures.
