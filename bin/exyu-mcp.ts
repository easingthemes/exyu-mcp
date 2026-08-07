#!/usr/bin/env node
import 'dotenv/config';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getPool } from '../src/db/pool.js';
import { createEmbeddingProvider } from '../src/providers/embedding.js';
import { createExyuServer } from '../src/server/createServer.js';

async function main() {
  const db = getPool();
  const embedder = createEmbeddingProvider();
  const server = createExyuServer({ db, embedder });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
