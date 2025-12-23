/**
 * Tests for tokens.ts
 */

import { describe, it, expect } from 'vitest';
import { estimateTokens, truncateToTokens } from '../../src/utils/tokens.js';

describe('estimateTokens', () => {
  it('should estimate tokens for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('should estimate tokens with default chars per token (4)', () => {
    // 20 characters = 5 tokens
    expect(estimateTokens('12345678901234567890')).toBe(5);
  });

  it('should estimate tokens with custom chars per token', () => {
    // 20 characters with 5 chars/token = 4 tokens
    expect(estimateTokens('12345678901234567890', 5)).toBe(4);
  });

  it('should round up partial tokens', () => {
    // 5 characters / 4 chars per token = 1.25, rounds to 2
    expect(estimateTokens('12345')).toBe(2);
  });

  it('should handle unicode characters', () => {
    // Unicode characters count by length
    const text = 'Hello 世界!';
    expect(estimateTokens(text)).toBeGreaterThan(0);
  });
});

describe('truncateToTokens', () => {
  it('should not truncate text under the limit', () => {
    const text = 'Hello, world!';
    const result = truncateToTokens(text, { maxTokens: 100 });

    expect(result.truncated).toBe(false);
    expect(result.text).toBe(text);
    expect(result.originalTokens).toBe(result.finalTokens);
  });

  it('should truncate text over the limit', () => {
    const text = 'A'.repeat(100); // 100 chars = 25 tokens
    const result = truncateToTokens(text, { maxTokens: 10 }); // 10 tokens = 40 chars

    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThan(text.length);
  });

  it('should add truncation suffix', () => {
    const text = 'A'.repeat(100);
    const result = truncateToTokens(text, { maxTokens: 10 });

    // Default suffix is '\n\n...[Response truncated due to token limit]'
    expect(result.text).toContain('truncated');
  });

  it('should use custom truncation suffix', () => {
    const text = 'A'.repeat(100);
    const result = truncateToTokens(text, {
      maxTokens: 10,
      truncationSuffix: '... (more)',
    });

    expect(result.text).toContain('... (more)');
  });

  it('should try to break at word boundaries', () => {
    const text = 'Hello world this is a longer sentence that needs truncation';
    const result = truncateToTokens(text, { maxTokens: 5 });

    // Should truncate but preserve word structure somewhat
    expect(result.truncated).toBe(true);
  });

  it('should report original token count', () => {
    const text = 'A'.repeat(200); // 50 tokens
    const result = truncateToTokens(text, { maxTokens: 10 });

    expect(result.originalTokens).toBe(50);
    expect(result.truncated).toBe(true);
  });

  it('should handle empty string', () => {
    const result = truncateToTokens('', { maxTokens: 10 });

    expect(result.truncated).toBe(false);
    expect(result.text).toBe('');
    expect(result.originalTokens).toBe(0);
    expect(result.finalTokens).toBe(0);
  });

  it('should handle text with newlines', () => {
    const text = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
    const result = truncateToTokens(text, { maxTokens: 5 });

    expect(result.truncated).toBe(true);
  });

  it('should respect custom charsPerToken', () => {
    const text = 'A'.repeat(100);

    // With 2 chars per token, 100 chars = 50 tokens
    const result2 = truncateToTokens(text, { maxTokens: 10, charsPerToken: 2 });

    // With 10 chars per token, 100 chars = 10 tokens (no truncation needed)
    const result10 = truncateToTokens(text, { maxTokens: 10, charsPerToken: 10 });

    expect(result2.truncated).toBe(true);
    expect(result10.truncated).toBe(false);
  });
});
