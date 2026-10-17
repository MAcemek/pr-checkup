import { describe, expect, it } from 'vitest';
import { runTemplateFilled, sectionContent } from '../../src/checks/template-filled.js';
import { checkConfig, makeContext, readFixture } from '../helpers/factories.js';

const template = readFixture('pull_request_template.md');
const config = checkConfig('template-filled');

const filledBody = [
  '## What does this PR do?',
  '',
  'Adds retry with exponential backoff to the HTTP client so flaky networks recover.',
  '',
  '## Related issue',
  '',
  'Fixes #12',
  '',
  '## Checklist',
  '',
  '- [x] I added or updated tests',
  '- [ ] I updated the documentation',
].join('\n');

describe('template-filled', () => {
  it('is not applicable when the repository has no template', () => {
    const result = runTemplateFilled(makeContext({ template: null }), config);
    expect(result.status).toBe('not-applicable');
  });

  it('fails when the body is the unchanged template', () => {
    const result = runTemplateFilled(makeContext({ template, body: template }), config);
    expect(result.status).toBe('fail');
    expect(result.message).toContain(
      'The description is still the unchanged pull request template.',
    );
    expect(result.message).toContain('None of the checklist items are ticked.');
    expect(result.howToFix).toContain(
      "You can edit the description at any time and I'll check again.",
    );
  });

  it('fails when the body is empty', () => {
    const result = runTemplateFilled(makeContext({ template, body: '' }), config);
    expect(result.status).toBe('fail');
    expect(result.message).toContain(
      "The description is empty, so the pull request template wasn't filled in.",
    );
  });

  it('fails when only a few characters were added', () => {
    const body = template.replace('## Related issue', 'ok\n\n## Related issue');
    const result = runTemplateFilled(makeContext({ template, body }), config);
    expect(result.status).toBe('fail');
    expect(result.message).toContain('mostly unfilled (only 2 characters were added)');
    expect(result.vars.added_chars).toBe(2);
  });

  it('passes when the template is filled in and a box is ticked', () => {
    const result = runTemplateFilled(makeContext({ template, body: filledBody }), config);
    expect(result.status).toBe('pass');
  });

  it('fails when the text is filled in but no checklist item is ticked', () => {
    const body = filledBody.replace('- [x]', '- [ ]');
    const result = runTemplateFilled(makeContext({ template, body }), config);
    expect(result.status).toBe('fail');
    expect(result.message).toBe('None of the checklist items are ticked.');
  });

  it('passes when the author removed the checklist entirely', () => {
    const body = filledBody.split('## Checklist')[0]!;
    expect(runTemplateFilled(makeContext({ template, body }), config).status).toBe('pass');
  });

  it('does not require ticked boxes when require_checked_box is false', () => {
    const body = filledBody.replace('- [x]', '- [ ]');
    const relaxed = checkConfig('template-filled', { require_checked_box: false });
    expect(runTemplateFilled(makeContext({ template, body }), relaxed).status).toBe('pass');
  });

  describe('required_sections', () => {
    const strict = checkConfig('template-filled', { required_sections: ['Related issue'] });

    it('fails when a required section only has the placeholder comment', () => {
      const body = filledBody.replace('Fixes #12', '<!-- Fixes #... -->');
      const result = runTemplateFilled(makeContext({ template, body }), strict);
      expect(result.status).toBe('fail');
      expect(result.message).toBe('These sections still need content: `Related issue`.');
      expect(result.vars.sections).toBe('`Related issue`');
    });

    it('fails when a required heading was deleted', () => {
      const body = filledBody.replace('## Related issue', '');
      const result = runTemplateFilled(makeContext({ template, body }), strict);
      expect(result.message).toContain('`Related issue`');
    });

    it('passes when the required section has content', () => {
      expect(runTemplateFilled(makeContext({ template, body: filledBody }), strict).status).toBe(
        'pass',
      );
    });
  });
});

describe('sectionContent', () => {
  it('returns the text between a heading and the next heading', () => {
    expect(sectionContent(filledBody, 'Related issue')?.trim()).toBe('Fixes #12');
  });

  it('matches headings case-insensitively and ignores a trailing colon', () => {
    expect(sectionContent('### Related Issue:\nFixes #1\n## Next', 'related issue')?.trim()).toBe(
      'Fixes #1',
    );
  });

  it('returns null when the heading is missing', () => {
    expect(sectionContent(filledBody, 'Screenshots')).toBeNull();
  });
});
