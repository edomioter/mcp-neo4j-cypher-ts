/**
 * Token Counting and Truncation Utilities
 *
 * Functions to estimate token counts and truncate text to token limits.
 *
 * Note: Since tiktoken is not available in Cloudflare Workers, we use
 * an approximation based on character count (~4 characters per token).
 * This is less accurate than tiktoken but works well for most use cases.
 *
 * Based on the original Python implementation in mcp-neo4j-cypher.
 */

import { DEFAULTS } from '../config/constants.js';

/**
 * Configuration options for token operations
 */
export interface TokenOptions {
  /** Approximate characters per token (default: 4) */
  charsPerToken?: number;
  /** Maximum tokens allowed (default: 10000) */
  maxTokens?: number;
  /** Suffix to add when truncating (default: '...[truncated]') */
  truncationSuffix?: string;
}

/**
 * Default token options
 */
const DEFAULT_OPTIONS: Required<TokenOptions> = {
  charsPerToken: DEFAULTS.CHARS_PER_TOKEN,
  maxTokens: DEFAULTS.TOKEN_LIMIT,
  truncationSuffix: '\n\n...[Response truncated due to token limit]',
};

/**
 * Estimate token count for a string
 *
 * Uses a simple approximation of ~4 characters per token.
 * This is based on the observation that GPT tokenizers typically
 * average 3-5 characters per token for English text.
 *
 * @param text - Text to estimate tokens for
 * @param charsPerToken - Characters per token ratio (default: 4)
 * @returns Estimated token count
 */
export function estimateTokens(
  text: string,
  charsPerToken: number = DEFAULTS.CHARS_PER_TOKEN
): number {
  if (!text) return 0;
  return Math.ceil(text.length / charsPerToken);
}

/**
 * Estimate token count for any data type
 *
 * Converts the data to JSON string and estimates tokens.
 *
 * @param data - Data to estimate tokens for
 * @param charsPerToken - Characters per token ratio (default: 4)
 * @returns Estimated token count
 */
export function estimateDataTokens(
  data: unknown,
  charsPerToken: number = DEFAULTS.CHARS_PER_TOKEN
): number {
  if (data === null || data === undefined) {
    return 1;
  }

  if (typeof data === 'string') {
    return estimateTokens(data, charsPerToken);
  }

  try {
    const jsonString = JSON.stringify(data);
    return estimateTokens(jsonString, charsPerToken);
  } catch {
    // If JSON serialization fails, estimate based on string conversion
    return estimateTokens(String(data), charsPerToken);
  }
}

/**
 * Truncate a string to a maximum token count
 *
 * @param text - Text to truncate
 * @param options - Token options
 * @returns Truncated text with suffix if truncation occurred
 */
export function truncateToTokens(
  text: string,
  options: TokenOptions = {}
): { text: string; truncated: boolean; originalTokens: number; finalTokens: number } {
  const mergedOptions: Required<TokenOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const originalTokens = estimateTokens(text, mergedOptions.charsPerToken);

  if (originalTokens <= mergedOptions.maxTokens) {
    return {
      text,
      truncated: false,
      originalTokens,
      finalTokens: originalTokens,
    };
  }

  // Calculate max characters based on token limit
  // Reserve space for the truncation suffix
  const suffixTokens = estimateTokens(mergedOptions.truncationSuffix, mergedOptions.charsPerToken);
  const availableTokens = mergedOptions.maxTokens - suffixTokens;
  const maxChars = availableTokens * mergedOptions.charsPerToken;

  // Truncate at a reasonable boundary (newline or space if possible)
  let truncateAt = maxChars;

  // Try to find a good break point (newline within last 100 chars)
  const lastNewline = text.lastIndexOf('\n', maxChars);
  if (lastNewline > maxChars - 100 && lastNewline > 0) {
    truncateAt = lastNewline;
  } else {
    // Try to break at a space
    const lastSpace = text.lastIndexOf(' ', maxChars);
    if (lastSpace > maxChars - 50 && lastSpace > 0) {
      truncateAt = lastSpace;
    }
  }

  const truncatedText = text.substring(0, truncateAt) + mergedOptions.truncationSuffix;
  const finalTokens = estimateTokens(truncatedText, mergedOptions.charsPerToken);

  return {
    text: truncatedText,
    truncated: true,
    originalTokens,
    finalTokens,
  };
}

/**
 * Truncate JSON data to a maximum token count
 *
 * Handles objects and arrays by progressively removing elements
 * until the token limit is met.
 *
 * @param data - Data to truncate
 * @param options - Token options
 * @returns Truncated data
 */
export function truncateDataToTokens<T = unknown>(
  data: T,
  options: TokenOptions = {}
): { data: T; truncated: boolean; originalTokens: number; finalTokens: number } {
  const mergedOptions: Required<TokenOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const originalTokens = estimateDataTokens(data, mergedOptions.charsPerToken);

  if (originalTokens <= mergedOptions.maxTokens) {
    return {
      data,
      truncated: false,
      originalTokens,
      finalTokens: originalTokens,
    };
  }

  // For strings, use string truncation
  if (typeof data === 'string') {
    const result = truncateToTokens(data, options);
    return {
      data: result.text as T,
      truncated: result.truncated,
      originalTokens: result.originalTokens,
      finalTokens: result.finalTokens,
    };
  }

  // For arrays, progressively remove elements from the end
  if (Array.isArray(data)) {
    const truncatedArray = truncateArray(data, mergedOptions);
    const finalTokens = estimateDataTokens(truncatedArray, mergedOptions.charsPerToken);

    return {
      data: truncatedArray as T,
      truncated: true,
      originalTokens,
      finalTokens,
    };
  }

  // For objects with rows/items arrays, truncate those
  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;

    // Check for common array properties
    const arrayKeys = ['rows', 'items', 'results', 'data', 'records', 'values'];

    for (const key of arrayKeys) {
      if (key in obj && Array.isArray(obj[key])) {
        const truncatedObj = { ...obj };
        truncatedObj[key] = truncateArray(obj[key] as unknown[], mergedOptions);

        const finalTokens = estimateDataTokens(truncatedObj, mergedOptions.charsPerToken);

        if (finalTokens <= mergedOptions.maxTokens) {
          return {
            data: truncatedObj as T,
            truncated: true,
            originalTokens,
            finalTokens,
          };
        }
      }
    }
  }

  // Fallback: convert to JSON string and truncate
  try {
    const jsonString = JSON.stringify(data, null, 2);
    const result = truncateToTokens(jsonString, options);

    // Try to parse back, but if truncation broke JSON, return as string
    if (result.truncated) {
      // Return a wrapper indicating truncation
      return {
        data: {
          _truncated: true,
          _originalTokens: originalTokens,
          _preview: jsonString.substring(0, 1000) + '...',
          _message: 'Response truncated due to token limit',
        } as T,
        truncated: true,
        originalTokens,
        finalTokens: result.finalTokens,
      };
    }

    return {
      data,
      truncated: false,
      originalTokens,
      finalTokens: originalTokens,
    };
  } catch {
    return {
      data,
      truncated: false,
      originalTokens,
      finalTokens: originalTokens,
    };
  }
}

/**
 * Truncate an array to fit within token limits
 *
 * Uses binary search to find the maximum number of elements
 * that fit within the token limit.
 *
 * @param arr - Array to truncate
 * @param options - Token options
 * @returns Truncated array with truncation indicator
 */
function truncateArray(
  arr: unknown[],
  options: Required<TokenOptions>
): unknown[] {
  const targetTokens = options.maxTokens;
  const totalItems = arr.length;

  // Binary search for the right array size
  let low = 0;
  let high = arr.length;
  let bestFit = 0;

  // Quick check: if first few elements already exceed limit, return minimal
  const minimalArray = arr.slice(0, 1);
  if (estimateDataTokens(minimalArray, options.charsPerToken) > targetTokens) {
    return [{
      _truncated: true,
      _message: `Array too large (${totalItems} items). First item preview available.`,
      _firstItem: typeof arr[0] === 'object' ? '[object]' : String(arr[0]).substring(0, 100),
    }];
  }

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const slice = arr.slice(0, mid);
    const tokens = estimateDataTokens(slice, options.charsPerToken);

    if (tokens <= targetTokens * 0.9) { // Leave 10% margin for truncation message
      bestFit = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  // Ensure we include at least some items
  bestFit = Math.max(bestFit, Math.min(5, arr.length));

  const truncatedArr = arr.slice(0, bestFit);

  if (bestFit < arr.length) {
    truncatedArr.push({
      _truncated: true,
      _message: `${arr.length - bestFit} more items truncated`,
      _totalItems: totalItems,
      _shownItems: bestFit,
    });
  }

  return truncatedArr;
}

/**
 * Check if data exceeds token limit
 *
 * Quick check without performing truncation.
 *
 * @param data - Data to check
 * @param maxTokens - Maximum token limit
 * @param charsPerToken - Characters per token ratio
 * @returns true if data exceeds the token limit
 */
export function exceedsTokenLimit(
  data: unknown,
  maxTokens: number = DEFAULTS.TOKEN_LIMIT,
  charsPerToken: number = DEFAULTS.CHARS_PER_TOKEN
): boolean {
  return estimateDataTokens(data, charsPerToken) > maxTokens;
}

/**
 * Format token count for display
 *
 * @param tokens - Token count
 * @returns Formatted string (e.g., "1.2k", "15.5k")
 */
export function formatTokenCount(tokens: number): string {
  if (tokens < 1000) {
    return String(tokens);
  }
  if (tokens < 10000) {
    return (tokens / 1000).toFixed(1) + 'k';
  }
  return Math.round(tokens / 1000) + 'k';
}

/**
 * Get token usage summary
 *
 * @param originalTokens - Original token count
 * @param finalTokens - Final token count after truncation
 * @param maxTokens - Maximum allowed tokens
 * @returns Summary object with formatted values
 */
export function getTokenUsageSummary(
  originalTokens: number,
  finalTokens: number,
  maxTokens: number = DEFAULTS.TOKEN_LIMIT
): {
  original: string;
  final: string;
  limit: string;
  percentUsed: number;
  truncated: boolean;
} {
  return {
    original: formatTokenCount(originalTokens),
    final: formatTokenCount(finalTokens),
    limit: formatTokenCount(maxTokens),
    percentUsed: Math.round((finalTokens / maxTokens) * 100),
    truncated: originalTokens > finalTokens,
  };
}
