import { describe, expect, it } from 'vitest';
import { runPrBurst } from '../../src/checks/pr-burst.js';
import { checkConfig, makeContext } from '../helpers/factories.js';

const config = checkConfig('pr-burst', { enabled: true });

describe('pr-burst', () => {
  it('is not applicable when the count is unknown', () => {
    expect(runPrBurst(makeContext({ recentPrCount: null }), config).status).toBe('not-applicable');
  });

  it('passes at the threshold', () => {
    expect(runPrBurst(makeContext({ recentPrCount: 10 }), config).status).toBe('pass');
  });

  it('fails above the threshold with a friendly message', () => {
    const result = runPrBurst(makeContext({ recentPrCount: 11 }), config);
    expect(result.status).toBe('fail');
    expect(result.message).toBe(
      "You've opened 11 pull requests across GitHub in the last 24 hours.",
    );
    expect(result.howToFix).toContain('completely fine');
    expect(result.vars).toEqual({ count: 11, max_prs: 10, window_hours: 24 });
  });
});
