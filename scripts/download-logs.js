#!/usr/bin/env node

/**
 * Download Cloudflare Workers logs from the last N days
 *
 * Usage: node scripts/download-logs.js [days] [output-file]
 * Example: node scripts/download-logs.js 5 logs-last-5-days.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const ACCOUNT_ID = 'fbe074a4d149441eb68832d5b116cbf6';
const WORKER_NAME = 'mcp-neo4j-cypher';
const DAYS = parseInt(process.argv[2]) || 5;
const OUTPUT_FILE = process.argv[3] || `logs-last-${DAYS}-days.json`;

// Calculate time range (last N days)
const endTime = new Date();
const startTime = new Date();
startTime.setDate(startTime.getDate() - DAYS);

console.log(`📥 Downloading logs from ${WORKER_NAME}...`);
console.log(`📅 Time range: ${startTime.toISOString()} to ${endTime.toISOString()}`);
console.log(`⏱️  Last ${DAYS} days`);

async function downloadLogs() {
  // Get Cloudflare API token from environment
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!apiToken) {
    console.error('❌ Error: CLOUDFLARE_API_TOKEN environment variable not set');
    console.log('\nTo set it:');
    console.log('  export CLOUDFLARE_API_TOKEN="your-token-here"');
    console.log('\nOr get your token from: https://dash.cloudflare.com/profile/api-tokens');
    process.exit(1);
  }

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/workers/observability/telemetry/query`;

  // Query for logs using Cloudflare's query language
  const query = {
    query: `
      SELECT
        timestamp,
        outcome,
        logs,
        exceptions,
        scriptName,
        scriptVersion,
        cpuTime,
        wallTime,
        event
      FROM WorkersInvocationsAdaptive
      WHERE
        scriptName = '${WORKER_NAME}' AND
        timestamp >= toDateTime('${startTime.toISOString()}') AND
        timestamp <= toDateTime('${endTime.toISOString()}')
      ORDER BY timestamp DESC
      LIMIT 10000
    `,
    format: 'JSON'
  };

  console.log('\n🔍 Executing query...');

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(query)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} ${response.statusText}\n${errorText}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(`Query failed: ${JSON.stringify(data.errors)}`);
    }

    console.log(`✅ Retrieved ${data.result?.data?.length || 0} log entries`);

    // Save to file
    const outputPath = path.resolve(OUTPUT_FILE);
    fs.writeFileSync(
      outputPath,
      JSON.stringify(data.result, null, 2),
      'utf-8'
    );

    console.log(`💾 Logs saved to: ${outputPath}`);
    console.log(`📊 File size: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB`);

    // Print summary
    if (data.result?.data) {
      const outcomes = {};
      data.result.data.forEach(log => {
        outcomes[log.outcome] = (outcomes[log.outcome] || 0) + 1;
      });

      console.log('\n📈 Summary:');
      console.log(`   Total requests: ${data.result.data.length}`);
      Object.entries(outcomes).forEach(([outcome, count]) => {
        console.log(`   ${outcome}: ${count}`);
      });
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run
downloadLogs();
