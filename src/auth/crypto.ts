/**
 * Cryptography Utilities
 *
 * Provides AES-GCM encryption and decryption using the Web Crypto API.
 * Used to securely store Neo4j credentials in D1.
 *
 * AES-GCM provides both confidentiality and authenticity.
 */

/**
 * Encryption result containing ciphertext and IV
 */
export interface EncryptedData {
  /** Base64-encoded ciphertext */
  ciphertext: string;
  /** Base64-encoded initialization vector */
  iv: string;
}

/**
 * Combined encrypted string format: iv:ciphertext (both base64)
 */
export type EncryptedString = string;

/**
 * AES-GCM configuration
 */
const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits recommended for GCM
const TAG_LENGTH = 128; // Authentication tag length in bits

/**
 * Derive a CryptoKey from a base64-encoded encryption key
 *
 * @param base64Key - Base64-encoded key material
 * @returns CryptoKey suitable for AES-GCM operations
 */
async function deriveKey(base64Key: string): Promise<CryptoKey> {
  // Decode base64 key
  const keyData = base64ToArrayBuffer(base64Key);

  // If key is not 32 bytes (256 bits), derive it using SHA-256
  let keyMaterial: ArrayBuffer;
  if (keyData.byteLength === 32) {
    keyMaterial = keyData;
  } else {
    // Hash the key to get exactly 32 bytes
    keyMaterial = await crypto.subtle.digest('SHA-256', keyData);
  }

  // Import as AES-GCM key
  return crypto.subtle.importKey(
    'raw',
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Generate a random initialization vector
 *
 * @returns Random IV as Uint8Array
 */
function generateIV(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(IV_LENGTH));
}

/**
 * Convert ArrayBuffer to base64 string
 *
 * @param buffer - ArrayBuffer to convert
 * @returns Base64-encoded string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] as number);
  }
  return btoa(binary);
}

/**
 * Convert base64 string to ArrayBuffer
 *
 * @param base64 - Base64-encoded string
 * @returns ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Encrypt plaintext using AES-GCM
 *
 * @param plaintext - String to encrypt
 * @param encryptionKey - Base64-encoded encryption key
 * @returns Encrypted data with ciphertext and IV
 */
export async function encrypt(
  plaintext: string,
  encryptionKey: string
): Promise<EncryptedData> {
  const key = await deriveKey(encryptionKey);
  const iv = generateIV();
  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(plaintext);

  const ciphertextBuffer = await crypto.subtle.encrypt(
    {
      name: ALGORITHM,
      iv,
      tagLength: TAG_LENGTH,
    },
    key,
    plaintextBytes
  );

  return {
    ciphertext: arrayBufferToBase64(ciphertextBuffer),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
  };
}

/**
 * Decrypt ciphertext using AES-GCM
 *
 * @param encryptedData - Encrypted data with ciphertext and IV
 * @param encryptionKey - Base64-encoded encryption key
 * @returns Decrypted plaintext
 * @throws Error if decryption fails (wrong key, tampered data, etc.)
 */
export async function decrypt(
  encryptedData: EncryptedData,
  encryptionKey: string
): Promise<string> {
  const key = await deriveKey(encryptionKey);
  const ivBuffer = base64ToArrayBuffer(encryptedData.iv);
  const iv = new Uint8Array(ivBuffer);
  const ciphertext = base64ToArrayBuffer(encryptedData.ciphertext);

  try {
    const plaintextBuffer = await crypto.subtle.decrypt(
      {
        name: ALGORITHM,
        iv,
        tagLength: TAG_LENGTH,
      },
      key,
      ciphertext
    );

    const decoder = new TextDecoder();
    return decoder.decode(plaintextBuffer);
  } catch (error) {
    throw new Error('Decryption failed: Invalid key or corrupted data');
  }
}

/**
 * Encrypt to a single combined string (iv:ciphertext)
 *
 * This format is convenient for storing in database columns.
 *
 * @param plaintext - String to encrypt
 * @param encryptionKey - Base64-encoded encryption key
 * @returns Combined encrypted string in format "iv:ciphertext"
 */
export async function encryptToString(
  plaintext: string,
  encryptionKey: string
): Promise<EncryptedString> {
  const { ciphertext, iv } = await encrypt(plaintext, encryptionKey);
  return `${iv}:${ciphertext}`;
}

/**
 * Decrypt from a combined string (iv:ciphertext)
 *
 * @param encryptedString - Combined encrypted string in format "iv:ciphertext"
 * @param encryptionKey - Base64-encoded encryption key
 * @returns Decrypted plaintext
 * @throws Error if format is invalid or decryption fails
 */
export async function decryptFromString(
  encryptedString: EncryptedString,
  encryptionKey: string
): Promise<string> {
  const parts = encryptedString.split(':');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error('Invalid encrypted string format');
  }

  const iv = parts[0];
  const ciphertext = parts[1];
  return decrypt({ iv, ciphertext }, encryptionKey);
}

/**
 * Generate a random encryption key
 *
 * Useful for initial setup. The generated key should be stored
 * securely (e.g., as a Cloudflare secret).
 *
 * @returns Base64-encoded random key
 */
export function generateEncryptionKey(): string {
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  return arrayBufferToBase64(keyBytes.buffer);
}

/**
 * Generate a random token (e.g., for session IDs)
 *
 * @param length - Number of random bytes (default: 32)
 * @returns Base64-encoded random token
 */
export function generateToken(length: number = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return arrayBufferToBase64(bytes.buffer);
}

/**
 * Generate a URL-safe random token
 *
 * Uses base64url encoding (no +, /, or = characters).
 *
 * @param length - Number of random bytes (default: 32)
 * @returns URL-safe random token
 */
export function generateUrlSafeToken(length: number = 32): string {
  const token = generateToken(length);
  return token
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Hash a string using SHA-256
 *
 * @param data - String to hash
 * @returns Hex-encoded hash
 */
export async function hash(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Securely compare two strings in constant time
 *
 * Prevents timing attacks when comparing secrets.
 *
 * @param a - First string
 * @param b - Second string
 * @returns true if strings are equal
 */
export function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}
