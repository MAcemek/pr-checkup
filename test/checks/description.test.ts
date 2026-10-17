import { describe, expect, it } from 'vitest';
import { runDescription } from '../../src/checks/description.js';
import { checkConfig, makeContext, readFixture } from '../helpers/factories.js';

const config = checkConfig('description');

describe('description', () => {
  it('fails when the body is empty', () => {
    const result = runDescription(makeContext({ body: '   \n' }), config);
    expect(result.status).toBe('fail');
    expect(result.message).toBe('The description is empty.');
    expect(result.howToFix).toContain('what this PR changes and why');
  });

  it('treats a body that is only an HTML comment as empty', () => {
    const result = runDescription(
      makeContext({ body: '<!-- describe your change here -->' }),
      config,
    );
    expect(result.message).toBe('The description is empty.');
  });

  it('fails when the body only contains the template text', () => {
    const template = readFixture('pull_request_template.md');
    const result = runDescription(makeContext({ template, body: template }), config);
    expect(result.status).toBe('fail');
    expect(result.message).toBe("The description only contains the pull request template's text.");
  });

  it('fails when the body repeats the title', () => {
    const ctx = makeContext({ title: 'Fix crash on startup', body: 'Fix crash on startup.' });
    const result = runDescription(ctx, config);
    expect(result.status).toBe('fail');
    expect(result.message).toBe('The description just repeats the title.');
  });

  it('fails when the description is shorter than min_length', () => {
    const result = runDescription(makeContext({ body: 'Fixes #1. Small fix.' }), config);
    expect(result.status).toBe('fail');
    expect(result.message).toBe(
      'The description is quite short (20 characters; at least 30 helps reviewers).',
    );
    expect(result.vars).toEqual({ length: 20, min_length: 30 });
  });

  it('passes with a real description', () => {
    expect(runDescription(makeContext(), config).status).toBe('pass');
  });

  it('respects a custom min_length', () => {
    const relaxed = checkConfig('description', { min_length: 0 });
    expect(runDescription(makeContext({ body: 'Tiny typo fix.' }), relaxed).status).toBe('pass');
  });
});
