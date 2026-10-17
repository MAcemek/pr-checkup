import { describe, expect, it } from 'vitest';
import { runLinkedIssue } from '../../src/checks/linked-issue.js';
import { checkConfig, makeContext } from '../helpers/factories.js';

const config = checkConfig('linked-issue');

describe('linked-issue', () => {
  it.each([
    ['a closing keyword', 'Fixes #12'],
    ['a bare reference', 'Related to #45, thanks!'],
    ['a reference in parentheses', 'Tidies the parser (#45)'],
    ['a cross-repo reference', 'Follow-up to octo-org/other#9'],
    ['an issue URL', 'See https://github.com/octo-org/widgets/issues/3 for context'],
    ['a discussion URL', 'Discussed in https://github.com/octo-org/widgets/discussions/8'],
    ['a GH- reference', 'Implements GH-77'],
  ])('passes with %s in the body', (_label, body) => {
    expect(runLinkedIssue(makeContext({ body }), config).status).toBe('pass');
  });

  it('passes when the reference is only in the title', () => {
    const ctx = makeContext({ title: 'Fix crash on startup (#45)', body: 'Details below.' });
    expect(runLinkedIssue(ctx, config).status).toBe('pass');
  });

  it('fails with an empty body and no reference in the title', () => {
    const result = runLinkedIssue(makeContext({ title: 'Update stuff', body: '' }), config);
    expect(result.status).toBe('fail');
    expect(result.message).toBe("I couldn't find a link to an issue in the title or description.");
    expect(result.howToFix).toContain('`Fixes #123`');
  });

  it('ignores references inside HTML comments', () => {
    const body = '<!-- Fixes #5 -->\nI changed the parser.';
    expect(runLinkedIssue(makeContext({ title: 'Parser', body }), config).status).toBe('fail');
  });

  it('does not treat HTML entities or words ending in #N as references', () => {
    const body = 'Escapes &#123; correctly, as described in section page#3.';
    expect(runLinkedIssue(makeContext({ title: 'Escaping', body }), config).status).toBe('fail');
  });

  describe('with require_keyword', () => {
    const strict = checkConfig('linked-issue', { require_keyword: true });

    it('fails with only a bare reference', () => {
      const result = runLinkedIssue(makeContext({ body: 'Related to #12' }), strict);
      expect(result.status).toBe('fail');
      expect(result.message).toContain('closing keyword');
    });

    it.each(['Closes #12', 'resolves: #12', 'Fixed octo-org/widgets#12'])(
      'passes with "%s"',
      (body) => {
        expect(runLinkedIssue(makeContext({ body }), strict).status).toBe('pass');
      },
    );

    it('ignores references in the title', () => {
      const ctx = makeContext({ title: 'Fixes #12', body: 'Some details here.' });
      expect(runLinkedIssue(ctx, strict).status).toBe('fail');
    });
  });

  it('accepts extra_patterns such as Jira keys', () => {
    const jira = checkConfig('linked-issue', { extra_patterns: ['\\b[A-Z]+-\\d+\\b'] });
    const ctx = makeContext({ title: 'Parser', body: 'Implements WIDGET-123.' });
    expect(runLinkedIssue(ctx, jira).status).toBe('pass');
    expect(runLinkedIssue(ctx, config).status).toBe('fail');
  });
});
