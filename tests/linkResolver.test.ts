import { describe, it, expect } from 'vitest';
import { slugifyHeading } from '../src/extensions/LinkResolver';

describe('slugifyHeading', () => {
  it('converts simple heading to lowercase slug', () => {
    expect(slugifyHeading('Hello World')).toBe('hello-world');
  });

  it('strips parentheses and special characters', () => {
    expect(slugifyHeading('public_docs (Documentation Analytics)')).toBe(
      'public_docs-documentation-analytics',
    );
  });

  it('preserves underscores and hyphens', () => {
    expect(slugifyHeading('my_variable-name')).toBe('my_variable-name');
  });

  it('collapses multiple spaces to single hyphen', () => {
    expect(slugifyHeading('Lots   of    spaces')).toBe('lots-of-spaces');
  });

  it('trims whitespace', () => {
    expect(slugifyHeading('  padded heading  ')).toBe('padded-heading');
  });

  it('handles heading with numbers', () => {
    expect(slugifyHeading('Step 1: Setup')).toBe('step-1-setup');
  });

  it('handles emoji and unicode', () => {
    expect(slugifyHeading('Hello 🌍 World')).toBe('hello-world');
  });

  it('handles empty string', () => {
    expect(slugifyHeading('')).toBe('');
  });

  it('handles heading with backticks and code', () => {
    expect(slugifyHeading('Using `console.log` in JS')).toBe('using-consolelog-in-js');
  });

  it('handles heading that is already a slug', () => {
    expect(slugifyHeading('already-a-slug')).toBe('already-a-slug');
  });

  it('matches GitHub-style anchor for complex heading', () => {
    // The user's exact example: [text](#public_docs-documentation-analytics)
    // should match heading "public_docs (Documentation Analytics)"
    const heading = 'public_docs (Documentation Analytics)';
    const anchor = 'public_docs-documentation-analytics';
    expect(slugifyHeading(heading)).toBe(anchor);
  });
});
