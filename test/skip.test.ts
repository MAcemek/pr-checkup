import { describe, expect, it } from 'vitest';
import { getSkipReason } from '../src/skip.js';
import { defaultConfig, makePull } from './helpers/factories.js';

const skip = defaultConfig().skip;

describe('getSkipReason', () => {
  it('returns null for an ordinary contributor PR', () => {
    expect(getSkipReason(makePull(), skip)).toBeNull();
  });

  it('skips closed PRs', () => {
    expect(getSkipReason(makePull({ state: 'closed' }), skip)).toBe('the pull request is not open');
  });

  it('skips bots by type or by [bot] suffix, unless disabled', () => {
    expect(getSkipReason(makePull({ authorType: 'Bot', authorLogin: 'renovate' }), skip)).toBe(
      'the author (renovate) is a bot',
    );
    expect(getSkipReason(makePull({ authorLogin: 'dependabot[bot]' }), skip)).toContain('is a bot');
    expect(getSkipReason(makePull({ authorType: 'Bot' }), { ...skip, bots: false })).toBeNull();
  });

  it('skips drafts unless disabled', () => {
    expect(getSkipReason(makePull({ draft: true }), skip)).toBe('the pull request is a draft');
    expect(getSkipReason(makePull({ draft: true }), { ...skip, drafts: false })).toBeNull();
  });

  it('skips authors in skip.authors, case-insensitively', () => {
    const config = { ...skip, authors: ['New-Contributor'] };
    expect(getSkipReason(makePull(), config)).toBe(
      'the author (new-contributor) is listed in skip.authors',
    );
  });

  it('skips trusted author associations', () => {
    expect(getSkipReason(makePull({ authorAssociation: 'MEMBER' }), skip)).toBe(
      "the author's association with the repository is MEMBER",
    );
    expect(
      getSkipReason(makePull({ authorAssociation: 'MEMBER' }), {
        ...skip,
        author_associations: [],
      }),
    ).toBeNull();
  });

  it('skips PRs with a skip label, case-insensitively', () => {
    expect(getSkipReason(makePull({ labels: ['Skip-Checkup'] }), skip)).toBe(
      'the pull request has the "Skip-Checkup" label',
    );
  });

  it('checks the bot rule before the draft rule', () => {
    expect(getSkipReason(makePull({ authorType: 'Bot', draft: true }), skip)).toContain('bot');
  });
});
