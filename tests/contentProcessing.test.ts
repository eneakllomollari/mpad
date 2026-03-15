// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { preprocessContent, postprocessContent } from '../src/lib/contentProcessing';

describe('preprocessContent', () => {
  it('extracts frontmatter', () => {
    const raw = '---\ntitle: Hello\n---\n# Body';
    const result = preprocessContent(raw);
    expect(result.frontmatter).toBe('title: Hello');
    expect(result.body).toBe('# Body');
  });

  it('returns null frontmatter when none present', () => {
    const raw = '# Just a heading';
    const result = preprocessContent(raw);
    expect(result.frontmatter).toBeNull();
    expect(result.body).toBe('# Just a heading');
  });

  it('ignores empty frontmatter', () => {
    const raw = '---\n   \n---\n# Body';
    const result = preprocessContent(raw);
    expect(result.frontmatter).toBeNull();
  });

  it('does not treat lone --- as frontmatter', () => {
    const raw = '---\nNot yaml because no closing';
    const result = preprocessContent(raw);
    expect(result.frontmatter).toBeNull();
    expect(result.body).toBe(raw);
  });

  it('extracts XML blocks', () => {
    const raw = '<example>\nsome content\n</example>';
    const result = preprocessContent(raw);
    expect(result.xmlBlocks).toHaveLength(1);
    expect(result.xmlBlocks[0].tagName).toBe('example');
    expect(result.xmlBlocks[0].content).toBe('some content');
    expect(result.body).toContain('data-type="xmlBlock"');
    expect(result.body).toContain('data-tag-name="example"');
  });

  it('handles multiple XML blocks', () => {
    const raw = '<foo>\nfoo content\n</foo>\n\n<bar>\nbar content\n</bar>';
    const result = preprocessContent(raw);
    expect(result.xmlBlocks).toHaveLength(2);
    expect(result.xmlBlocks[0].tagName).toBe('foo');
    expect(result.xmlBlocks[1].tagName).toBe('bar');
  });

  it('handles frontmatter + XML blocks together', () => {
    const raw = '---\ntitle: Test\n---\n# Heading\n\n<example>\ncontent\n</example>';
    const result = preprocessContent(raw);
    expect(result.frontmatter).toBe('title: Test');
    expect(result.xmlBlocks).toHaveLength(1);
    expect(result.body).toContain('# Heading');
    expect(result.body).toContain('data-type="xmlBlock"');
  });

  it('works correctly on consecutive calls (stateful regex)', () => {
    const raw1 = '<foo>\ncontent1\n</foo>';
    const raw2 = '<bar>\ncontent2\n</bar>';

    const result1 = preprocessContent(raw1);
    const result2 = preprocessContent(raw2);

    expect(result1.xmlBlocks).toHaveLength(1);
    expect(result2.xmlBlocks).toHaveLength(1);
    expect(result2.xmlBlocks[0]?.tagName).toBe('bar');
  });

  it('works on same input called twice', () => {
    const raw = '<example>\ncontent\n</example>';
    const result1 = preprocessContent(raw);
    const result2 = preprocessContent(raw);

    expect(result1.xmlBlocks).toHaveLength(1);
    expect(result2.xmlBlocks).toHaveLength(1);
  });
});

describe('postprocessContent', () => {
  it('restores frontmatter with blank line', () => {
    const result = postprocessContent('\n# Body', 'title: Hello', []);
    expect(result).toBe('---\ntitle: Hello\n---\n\n# Body\n');
  });

  it('restores XML blocks via text placeholder', () => {
    const xmlBlocks = [{ placeholder: '%%XMLBLOCK:0%%', tagName: 'example', content: 'some content' }];
    const result = postprocessContent('text\n\n%%XMLBLOCK:0%%', null, xmlBlocks);
    expect(result).toContain('<example>\nsome content\n</example>');
    expect(result).not.toContain('%%XMLBLOCK');
  });

  it('restores XML blocks via HTML div placeholder', () => {
    const xmlBlocks = [{ placeholder: '%%XMLBLOCK:0%%', tagName: 'example', content: 'some content' }];
    const div = '<div data-type="xmlBlock" data-tag-name="example" data-content="some content" data-index="0"></div>';
    const result = postprocessContent(`text\n\n${div}`, null, xmlBlocks);
    expect(result).toContain('<example>\nsome content\n</example>');
    expect(result).not.toContain('data-type="xmlBlock"');
  });

  it('round-trips with preprocessContent', () => {
    const original = '---\ntitle: Test\n---\n\n# Heading\n\nSome text\n\n<example>\nxml content\n</example>\n';
    const { frontmatter, body, xmlBlocks } = preprocessContent(original);
    const restored = postprocessContent(body, frontmatter, xmlBlocks);
    expect(restored).toBe(original);
  });

  it('handles null frontmatter', () => {
    const result = postprocessContent('# Body', null, []);
    expect(result).toBe('# Body\n');
    expect(result).not.toContain('---');
  });

  it('unescapes brackets outside code blocks', () => {
    const result = postprocessContent('This has a footnote\\[^1\\].', null, []);
    expect(result).toContain('[^1]');
    expect(result).not.toContain('\\[');
  });

  it('unescapes HTML entities outside code blocks', () => {
    const result = postprocessContent('Less than: &lt; Greater than: &gt;', null, []);
    expect(result).toContain('Less than: <');
    expect(result).toContain('Greater than: >');
  });

  it('does NOT unescape inside code blocks', () => {
    const result = postprocessContent('```\n\\[escaped\\] &lt;tag&gt;\n```', null, []);
    expect(result).toContain('\\[escaped\\]');
    expect(result).toContain('&lt;tag&gt;');
  });

  it('ensures trailing newline', () => {
    const result = postprocessContent('no trailing newline', null, []);
    expect(result.endsWith('\n')).toBe(true);
  });

  it('unescapes heading markers', () => {
    const result = postprocessContent('\\## Heading', null, []);
    expect(result).toContain('## Heading');
  });

  it('tightens task list items with blank lines between them', () => {
    const loose = '- [x] First task\n\n- [ ] Second task\n\n- [ ] Third task';
    const result = postprocessContent(loose, null, []);
    expect(result).toBe('- [x] First task\n- [ ] Second task\n- [ ] Third task\n');
  });

  it('preserves blank lines between non-task-list content and task items', () => {
    const md = 'Some text\n\n- [x] First task\n- [ ] Second task';
    const result = postprocessContent(md, null, []);
    expect(result).toContain('Some text\n\n- [x] First task');
  });

  it('does not affect regular bullet lists', () => {
    const md = '- Item 1\n\n- Item 2\n\n- Item 3';
    const result = postprocessContent(md, null, []);
    expect(result).toContain('- Item 1\n\n- Item 2\n\n- Item 3');
  });
});
