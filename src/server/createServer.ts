import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import pg from 'pg';
import { resolveReferenceToolDefinition, handleResolveReference } from '../tools/resolveReferenceTool.js';
import type { EmbeddingProvider } from '../providers/embedding.js';

// The installed @modelcontextprotocol/sdk's `registerTool` expects `inputSchema` as a Zod
// raw shape (Record<string, ZodTypeAny>), not the plain JSON Schema object that
// `resolveReferenceToolDefinition.inputSchema` exposes for other consumers (e.g. documentation).
// We translate the one required `query: string` field here rather than changing the tool
// module's public contract.
const inputSchemaShape = {
  query: z.string().describe(resolveReferenceToolDefinition.inputSchema.properties.query.description)
};

export function createExyuServer(deps: { db: pg.Pool | pg.Client; embedder: EmbeddingProvider }): McpServer {
  const server = new McpServer({ name: 'exyu-mcp', version: '0.1.0' });

  server.registerTool(
    resolveReferenceToolDefinition.name,
    {
      description: resolveReferenceToolDefinition.description,
      inputSchema: inputSchemaShape,
      annotations: resolveReferenceToolDefinition.annotations
    },
    async ({ query }: { query: string }) => {
      // `handleResolveReference` is typed against a hand-rolled local `CallToolResult`
      // (no index signature), while the SDK's `ToolCallback` expects its own `CallToolResult`
      // (with a `[x: string]: unknown` index signature from its Zod schema). Re-spreading into
      // a fresh object literal here lets TS structurally check it against the SDK's type without
      // changing resolveReferenceTool.ts's public contract.
      const result = await handleResolveReference(query, deps);
      return { content: result.content, isError: result.isError };
    }
  );

  return server;
}
