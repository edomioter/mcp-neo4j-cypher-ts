/**
 * Tests for crypto.ts
 */

import { describe, it, expect } from 'vitest';
import {
  encryptToString,
  decryptFromString,
  generateUrlSafeToken,
  hash,
  secureCompare,
} from '../../src/auth/crypto.js';

describe('encryptToString / decryptFromString', () => {
  // Use a valid base64-encoded 32-byte key
  const testKey = 'dGVzdC1lbmNyeXB0aW9uLWtleS0zMi1ieXRlcw=='; // base64 of "test-encryption-key-32-bytes"

  it('should encrypt and decrypt a simple string', async () => {
    const plaintext = 'Hello, World!';

    const encrypted = await encryptToString(plaintext, testKey);
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted).toContain(':'); // Format: iv:ciphertext

    const decrypted = await decryptFromString(encrypted, testKey);
    expect(decrypted).toBe(plaintext);
  });

  it('should encrypt and decrypt unicode strings', async () => {
    const plaintext = 'Hello, 世界! 🌍';

    const encrypted = await encryptToString(plaintext, testKey);
    const decrypted = await decryptFromString(encrypted, testKey);

    expect(decrypted).toBe(plaintext);
  });

  it('should encrypt and decrypt empty string', async () => {
    const plaintext = '';

    const encrypted = await encryptToString(plaintext, testKey);
    const decrypted = await decryptFromString(encrypted, testKey);

    expect(decrypted).toBe(plaintext);
  });

  it('should encrypt and decrypt long strings', async () => {
    const plaintext = 'A'.repeat(10000);

    const encrypted = await encryptToString(plaintext, testKey);
    const decrypted = await decryptFromString(encrypted, testKey);

    expect(decrypted).toBe(plaintext);
  });

  it('should produce different ciphertexts for same plaintext (due to IV)', async () => {
    const plaintext = 'Same text';

    const encrypted1 = await encryptToString(plaintext, testKey);
    const encrypted2 = await encryptToString(plaintext, testKey);

    expect(encrypted1).not.toBe(encrypted2);

    // But both should decrypt to the same value
    const decrypted1 = await decryptFromString(encrypted1, testKey);
    const decrypted2 = await decryptFromString(encrypted2, testKey);

    expect(decrypted1).toBe(plaintext);
    expect(decrypted2).toBe(plaintext);
  });

  it('should fail to decrypt with wrong key', async () => {
    const plaintext = 'Secret message';
    const wrongKey = 'wrong-encryption-key-for-testing';

    const encrypted = await encryptToString(plaintext, testKey);

    await expect(decryptFromString(encrypted, wrongKey)).rejects.toThrow();
  });

  it('should fail to decrypt corrupted ciphertext', async () => {
    const plaintext = 'Secret message';

    const encrypted = await encryptToString(plaintext, testKey);
    const corrupted = encrypted.slice(0, -10) + 'corrupted!';

    await expect(decryptFromString(corrupted, testKey)).rejects.toThrow();
  });

  it('should fail to decrypt with invalid format', async () => {
    await expect(decryptFromString('invalid-no-colon', testKey)).rejects.toThrow();
  });
});

describe('generateUrlSafeToken', () => {
  it('should generate a token of specified length', () => {
    const token = generateUrlSafeToken(32);

    // Base64 encoding increases length: 32 bytes -> ~43 chars
    expect(token.length).toBeGreaterThanOrEqual(32);
  });

  it('should generate URL-safe tokens', () => {
    const token = generateUrlSafeToken(64);

    // Should not contain URL-unsafe characters
    expect(token).not.toContain('+');
    expect(token).not.toContain('/');
    expect(token).not.toContain('=');

    // Should only contain URL-safe chars
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('should generate unique tokens', () => {
    const tokens = new Set<string>();

    for (let i = 0; i < 100; i++) {
      tokens.add(generateUrlSafeToken(32));
    }

    // All 100 tokens should be unique
    expect(tokens.size).toBe(100);
  });

  it('should use default length of 32', () => {
    const token = generateUrlSafeToken();
    expect(token.length).toBeGreaterThanOrEqual(32);
  });
});

describe('hash', () => {
  it('should hash a string', async () => {
    const input = 'test input';
    const result = await hash(input);

    expect(result).toBeTruthy();
    expect(result.length).toBe(64); // SHA-256 = 64 hex chars
  });

  it('should produce consistent hashes', async () => {
    const input = 'consistent input';

    const hash1 = await hash(input);
    const hash2 = await hash(input);

    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different inputs', async () => {
    const hash1 = await hash('input1');
    const hash2 = await hash('input2');

    expect(hash1).not.toBe(hash2);
  });

  it('should hash empty string', async () => {
    const result = await hash('');
    expect(result).toBeTruthy();
    expect(result.length).toBe(64);
  });
});

describe('secureCompare', () => {
  it('should return true for equal strings', () => {
    expect(secureCompare('secret', 'secret')).toBe(true);
  });

  it('should return false for different strings', () => {
    expect(secureCompare('secret', 'different')).toBe(false);
  });

  it('should return false for different length strings', () => {
    expect(secureCompare('short', 'longer string')).toBe(false);
  });

  it('should return true for empty strings', () => {
    expect(secureCompare('', '')).toBe(true);
  });

  it('should handle unicode strings', () => {
    expect(secureCompare('世界🌍', '世界🌍')).toBe(true);
    expect(secureCompare('世界🌍', '世界🌎')).toBe(false);
  });
});
