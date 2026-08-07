import 'dotenv/config';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { getPool } from '../db/pool.js';
import { createEmbeddingProvider } from '../providers/embedding.js';
import { createExyuServer } from './createServer.js';

const app = express();
app.use(express.json());

const db = getPool();
const embedder = createEmbeddingProvider();

app.post('/mcp', async (req, res) => {
  const server = createExyuServer({ db, embedder });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
  res.on('close', () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  console.log(`exyu-mcp HTTP transport listening on :${port}`);
});
