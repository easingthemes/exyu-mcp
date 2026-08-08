import 'dotenv/config';
import express, { type Express } from 'express';
import pg from 'pg';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { getPool } from '../db/pool.js';
import { createEmbeddingProvider, type EmbeddingProvider } from '../providers/embedding.js';
import { createExyuServer } from './createServer.js';

function methodNotAllowed(res: express.Response): void {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed' },
    id: null
  });
}

/**
 * Builds the Express app that serves the MCP Streamable-HTTP endpoint.
 *
 * The transport runs in *stateless* mode (`sessionIdGenerator: undefined`): a fresh
 * server + transport pair is created per POST and torn down when the response closes.
 * Stateful mode would hand the client an `Mcp-Session-Id` that this app has no session
 * store to look up, so the client's second request (any call after `initialize`) would
 * land on a brand-new, never-initialized transport and be rejected with a 400.
 */
export function createApp(deps: { db: pg.Pool | pg.Client; embedder: EmbeddingProvider }): Express {
  const app = express();
  app.use(express.json());

  app.post('/mcp', async (req, res) => {
    const server = createExyuServer(deps);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  // Stateless mode has no SSE stream to resume and no session to terminate, so the
  // GET/DELETE halves of the Streamable-HTTP spec are unsupported. Answer them with a
  // JSON-RPC-shaped 405 instead of Express's default HTML 404, which an MCP client
  // cannot parse.
  app.get('/mcp', (_req, res) => methodNotAllowed(res));
  app.delete('/mcp', (_req, res) => methodNotAllowed(res));

  app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = createApp({ db: getPool(), embedder: createEmbeddingProvider() });
  const port = Number(process.env.PORT ?? 8787);
  app.listen(port, () => {
    console.log(`exyu-mcp HTTP transport listening on :${port}`);
  });
}
