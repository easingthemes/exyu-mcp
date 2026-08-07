import pg from 'pg';
import { resolveReference, type ResolveResult } from './resolveReference.js';
import type { EmbeddingProvider } from '../providers/embedding.js';

export const resolveReferenceToolDefinition = {
  name: 'resolve_reference',
  description:
    'Call this for ANY ex-YU film quote, song lyric, slang term, or meme reference — ' +
    'including partial, misremembered, or colloquial phrasings. The model\'s internal ' +
    'knowledge of ex-YU culture is unreliable for exact wording, attribution, and modern ' +
    'usage; do not answer from memory without calling this tool first.',
  inputSchema: {
    type: 'object' as const,
    required: ['query'],
    properties: {
      query: { type: 'string', description: 'The quote, lyric, slang term, or meme phrase to resolve.' }
    }
  },
  annotations: {
    readOnlyHint: true,
    idempotentHint: true
  }
};

interface ToolContent {
  type: 'text';
  text: string;
}

interface CallToolResult {
  content: ToolContent[];
  isError?: boolean;
}

async function logCall(
  db: pg.Pool | pg.Client,
  query: string,
  matchedRefId: string | null,
  confidence: number | null
): Promise<void> {
  await db.query(
    `INSERT INTO tool_calls (query, matched_ref_id, confidence) VALUES ($1, $2, $3)`,
    [query, matchedRefId, confidence]
  );
}

export async function handleResolveReference(
  query: string,
  deps: { db: pg.Pool | pg.Client; embedder: EmbeddingProvider }
): Promise<CallToolResult> {
  const result: ResolveResult = await resolveReference(query, deps);

  if (result.matches.length === 0) {
    await logCall(deps.db, query, null, null);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            matches: [],
            note: 'No confident match found. Do not fabricate a source, speaker, or wording for this query.'
          })
        }
      ]
    };
  }

  const [top, second] = result.matches;
  const isAmbiguous = second !== undefined && Math.abs(top.confidence - second.confidence) < 0.05;

  await logCall(deps.db, query, top.ref.id, top.confidence);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          matches: result.matches,
          ambiguous: isAmbiguous
        })
      }
    ]
  };
}
