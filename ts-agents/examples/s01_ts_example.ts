#!/usr/bin/env tsx
/**
 * s01_ts_example.ts - TypeScript Environment Test
 *
 * This file tests that the TypeScript environment is properly configured.
 * Run with: pnpm s01
 */

import Anthropic from '@anthropic-ai/sdk';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Test configuration
const config = {
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: process.env.MODEL_ID || 'claude-sonnet-4-6',
  baseURL: process.env.ANTHROPIC_BASE_URL,
};

console.log('🔍 TypeScript Environment Test');
console.log('================================\n');

// Test 1: Check environment variables
console.log('✅ Test 1: Environment Variables');
console.log(`  - Model: ${config.model}`);
console.log(`  - Base URL: ${config.baseURL || 'default'}`);
console.log(`  - API Key: ${config.apiKey ? '✓ Set' : '✗ Missing'}\n`);

// Test 2: Test TypeScript types
console.log('✅ Test 2: TypeScript Type System');
interface TestMessage {
  role: 'user' | 'assistant';
  content: string;
}

const message: TestMessage = {
  role: 'user',
  content: 'Hello, TypeScript!',
};
console.log(`  - Message: ${JSON.stringify(message)}\n`);

// Test 3: Test async/await
console.log('✅ Test 3: Async/Await Support');
async function testAsync(): Promise<string> {
  return 'Async functions work!';
}
testAsync().then((result) => console.log(`  - ${result}\n`));

// Test 4: Test Anthropic SDK (if API key is available)
if (config.apiKey) {
  console.log('✅ Test 4: Anthropic SDK Connection');
  const client = new Anthropic({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  });

  client.messages
    .create({
      model: config.model,
      max_tokens: 100,
      messages: [{ role: 'user', content: 'Say "Hello, Message from Model Message!" in one sentence.' }],
    })
    .then((response) => {
      const text = response.content[0];
      console.log(
        `  - API Response: ${
          text.type === 'text' ? text.text : 'Unexpected response type'
        }\n`
      );
      console.log('================================');
      console.log('🎉 All tests passed! TypeScript environment is ready.\n');
    })
    .catch((error) => {
      console.log(`  - API Error: ${error.message}\n`);
      console.log('================================');
      console.log('⚠️  Environment configured but API test failed.\n');
      console.log('Check your ANTHROPIC_API_KEY in .env file\n');
    });
} else {
  console.log('⏭️  Test 4: Skipped (No API key configured)\n');
  console.log('================================');
  console.log('✅ TypeScript environment is ready!');
  console.log('💡 To test API connection, add ANTHROPIC_API_KEY to .env\n');
}
