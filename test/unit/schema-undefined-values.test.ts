/**
 * Tests for schema extraction bug: "Cannot read properties of undefined (reading 'length')"
 *
 * This test file verifies the bug described in PR_FIX_SCHEMA_UNDEFINED_LENGTH.md
 * where Neo4j returns a response with `data` existing but `data.values` being undefined.
 *
 * Bug location: src/neo4j/schema.ts line 56
 * Current code: if (!result.data || result.data.values.length === 0)
 * Problem: When result.data exists but result.data.values is undefined,
 *          accessing .length throws TypeError
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractSchema } from '../../src/neo4j/schema.js';
import { createNeo4jClient, Neo4jClient } from '../../src/neo4j/client.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('Schema Extraction Bug: undefined values property', () => {
  const testConnection = {
    uri: 'neo4j+s://test.databases.neo4j.io',
    username: 'neo4j',
    password: 'password123',
    database: 'neo4j',
  };

  let client: Neo4jClient;

  beforeEach(() => {
    mockFetch.mockReset();
    client = createNeo4jClient(testConnection);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Bug reproduction: extractSchemaWithApoc (line 56)', () => {
    /**
     * Case 1: Normal response - should work
     * result = { data: { fields: ['schema'], values: [[{...}]] } }
     */
    it('should work with normal response (data.values exists)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            fields: ['schema'],
            values: [[{
              Person: {
                type: 'node',
                count: 100,
                properties: {
                  name: { type: 'STRING', indexed: false, unique: false }
                },
                relationships: {}
              }
            }]]
          },
        }),
      });

      const result = await extractSchema(client);
      expect(result.labels).toHaveLength(1);
      expect(result.labels[0].name).toBe('Person');
    });

    /**
     * Case 2: Empty values array - should throw "Empty schema result from APOC"
     * result = { data: { fields: ['schema'], values: [] } }
     */
    it('should handle empty values array gracefully', async () => {
      // First call: APOC returns empty values
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { fields: ['schema'], values: [] },
        }),
      });

      // Second call: fallback to manual extraction - db.labels()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { fields: ['label'], values: [] },
        }),
      });

      // Third call: db.relationshipTypes()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { fields: ['relationshipType'], values: [] },
        }),
      });

      // Should fall back to manual extraction (empty but no error)
      const result = await extractSchema(client);
      expect(result.labels).toHaveLength(0);
    });

    /**
     * Case 3: THE BUG - data exists but values is undefined
     * result = { data: { fields: ['schema'] } }  // values undefined
     *
     * Current code (line 56):
     *   if (!result.data || result.data.values.length === 0)
     *
     * Evaluation:
     *   1. result.data exists → !result.data is false
     *   2. JavaScript evaluates result.data.values.length
     *   3. values is undefined → TypeError: Cannot read properties of undefined (reading 'length')
     */
    it('FIXED: should handle undefined values gracefully (no TypeError)', async () => {
      // APOC returns data but values undefined
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { fields: ['schema'] }, // values is undefined!
        }),
      });

      // The fix catches undefined values and falls back to manual extraction
      // db.labels() also returns data without values - but now handled gracefully
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { fields: ['label'] }, // values undefined - now handled
        }),
      });

      // db.relationshipTypes()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { fields: ['relationshipType'] }, // values undefined - now handled
        }),
      });

      // AFTER FIX: Should not throw, returns empty schema
      const result = await extractSchema(client);
      expect(result).toBeDefined();
      expect(result.labels).toEqual([]);
      expect(result.relationshipTypes).toEqual([]);
    });

    /**
     * Case 3b: Verify the fix handles undefined values without crashing
     */
    it('FIXED: should return empty schema when all values are undefined', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { fields: ['schema'] }, // values undefined
        }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { fields: ['label'] }, // values undefined
        }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { fields: ['relationshipType'] }, // values undefined
        }),
      });

      // No error should be thrown - graceful handling
      const result = await extractSchema(client);
      expect(result).toBeDefined();
      expect(result.summary).toContain('0 node label(s)');
      expect(result.summary).toContain('0 relationship type(s)');
    });

    /**
     * Case 4: data is completely undefined - should be handled
     * result = {}
     */
    it('should handle missing data property gracefully', async () => {
      // APOC call - no data property
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}), // data undefined
      });

      // Fallback: db.labels()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { fields: ['label'], values: [] },
        }),
      });

      // Fallback: db.relationshipTypes()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { fields: ['relationshipType'], values: [] },
        }),
      });

      // Should fall back to manual extraction
      const result = await extractSchema(client);
      expect(result.labels).toHaveLength(0);
    });
  });

  describe('Fix verification: extractSchemaManually - labelsResult (line 174-175)', () => {
    /**
     * In extractSchemaManually, line 174-175:
     *   BEFORE: if (labelsResult.data) { for (const row of labelsResult.data.values) }
     *   AFTER:  if (labelsResult.data?.values) { for (const row of labelsResult.data.values) }
     *
     * The fix adds optional chaining to prevent iterating undefined
     */
    it('FIXED: should handle undefined values in labels gracefully', async () => {
      // APOC fails first
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errors: [{ code: 'Neo.ClientError.Procedure.ProcedureNotFound', message: 'APOC not found' }],
        }),
      });

      // db.labels() returns data but no values - now handled gracefully
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { fields: ['label'] }, // values undefined - fix handles this
        }),
      });

      // db.relationshipTypes()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { fields: ['relationshipType'], values: [] },
        }),
      });

      // AFTER FIX: Should not throw
      const result = await extractSchema(client);
      expect(result).toBeDefined();
      expect(result.labels).toEqual([]);
    });
  });

  describe('Fix verification: extractSchemaManually - relTypesResult (line 264-265)', () => {
    /**
     * In extractSchemaManually, line 264-265:
     *   BEFORE: if (relTypesResult.data) { for (const row of relTypesResult.data.values) }
     *   AFTER:  if (relTypesResult.data?.values) { for (const row of relTypesResult.data.values) }
     */
    it('FIXED: should handle undefined values in relationshipTypes gracefully', async () => {
      // APOC fails
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errors: [{ code: 'Neo.ClientError.Procedure.ProcedureNotFound', message: 'APOC not found' }],
        }),
      });

      // db.labels() works fine
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { fields: ['label'], values: [] },
        }),
      });

      // db.relationshipTypes() returns data but no values - now handled gracefully
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { fields: ['relationshipType'] }, // values undefined - fix handles this
        }),
      });

      // AFTER FIX: Should not throw
      const result = await extractSchema(client);
      expect(result).toBeDefined();
      expect(result.relationshipTypes).toEqual([]);
    });
  });

  describe('Bug reproduction: getDatabaseInfo (client.ts line 238)', () => {
    /**
     * In client.ts getDatabaseInfo(), line 238:
     *   if (result.data && result.data.values.length > 0) {
     *
     * Same pattern - data exists but values undefined causes TypeError
     */
    it('BUG: should throw TypeError in getDatabaseInfo when data.values is undefined', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { fields: ['name', 'version'] }, // values undefined!
        }),
      });

      // getDatabaseInfo catches errors and returns null, so we need to verify
      // it doesn't crash but also doesn't work correctly
      // The bug is that it throws before the catch can handle it properly
      const result = await client.getDatabaseInfo();

      // Note: getDatabaseInfo has a try-catch that returns null on error
      // So the TypeError is caught and null is returned
      // This is "working" but not ideal - better to handle undefined values explicitly
      expect(result).toBeNull();
    });
  });

  describe('Root cause analysis', () => {
    it('demonstrates the JavaScript evaluation order that causes the bug', () => {
      // This test demonstrates WHY the bug occurs

      const result = {
        data: { fields: ['schema'] }, // values is undefined
      };

      // The problematic condition:
      // if (!result.data || result.data.values.length === 0)

      // Step 1: !result.data
      expect(!result.data).toBe(false); // result.data exists, so this is false

      // Step 2: Since step 1 is false, JavaScript evaluates the right side of ||
      // result.data.values.length

      // Step 3: result.data.values is undefined
      expect(result.data.values).toBeUndefined();

      // Step 4: Accessing .length on undefined throws TypeError
      expect(() => {
        // @ts-expect-error - intentionally accessing undefined
        result.data.values.length;
      }).toThrow(TypeError);
      expect(() => {
        // @ts-expect-error - intentionally accessing undefined
        result.data.values.length;
      }).toThrow("Cannot read properties of undefined (reading 'length')");
    });

    it('demonstrates the fix using optional chaining', () => {
      const result = {
        data: { fields: ['schema'] }, // values is undefined
      };

      // The fixed condition uses optional chaining:
      // if (!result.data?.values?.length)

      // This safely handles all cases:
      expect(!result.data?.values?.length).toBe(true); // Safe, returns true (falsy)

      // With empty values:
      const resultEmpty = {
        data: { fields: ['schema'], values: [] },
      };
      expect(!resultEmpty.data?.values?.length).toBe(true); // length is 0, falsy

      // With valid values:
      const resultValid = {
        data: { fields: ['schema'], values: [[{}]] },
      };
      expect(!resultValid.data?.values?.length).toBe(false); // length is 1, truthy
    });
  });

  describe('Regression prevention', () => {
    /**
     * These tests ensure the fix continues to work and the bug doesn't regress.
     */

    it('should handle APOC returning undefined values by falling back gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { fields: ['schema'] }, // values undefined
        }),
      });

      // Fallback calls
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { fields: ['label'], values: [] },
        }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { fields: ['relationshipType'], values: [] },
        }),
      });

      // Fix ensures graceful fallback to manual extraction
      const result = await extractSchema(client);
      expect(result).toBeDefined();
      expect(result.labels).toBeDefined();
    });

    it('should handle manual extraction with undefined values', async () => {
      // APOC fails
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errors: [{ code: 'Neo.ClientError.Procedure.ProcedureNotFound', message: 'APOC not found' }],
        }),
      });

      // db.labels() returns data but no values
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { fields: ['label'] }, // values undefined
        }),
      });

      // db.relationshipTypes()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { fields: ['relationshipType'], values: [] },
        }),
      });

      // Fix ensures empty labels instead of crash
      const result = await extractSchema(client);
      expect(result).toBeDefined();
      expect(result.labels).toEqual([]);
    });
  });
});
