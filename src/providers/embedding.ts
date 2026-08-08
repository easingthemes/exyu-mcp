export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
}

/**
 * Dimension of the `refs.embedding` column (`vector(1536)` in
 * db/migrations/001_init.sql), which matches the default OpenAI
 * `text-embedding-3-small` model.
 *
 * The column dimension is not parameterized for the MVP, so a provider swap
 * (voyage-3 = 1024, local models arbitrary) would otherwise fail with a cryptic
 * Postgres error — or, for the query side, silently skew results. Callers assert
 * against this constant right after `embed()`.
 */
export const EXPECTED_EMBEDDING_DIM = 1536;

export function assertEmbeddingDimension(embedding: number[]): void {
  if (embedding.length !== EXPECTED_EMBEDDING_DIM) {
    throw new Error(
      `Embedding dimension mismatch: got ${embedding.length}, expected ${EXPECTED_EMBEDDING_DIM} ` +
        `(column is vector(${EXPECTED_EMBEDDING_DIM}) — see db/migrations/001_init.sql). ` +
        `If you're switching EMBEDDING_PROVIDER, you must also alter the embedding column's dimension.`
    );
  }
}

class OpenAIEmbeddingProvider implements EmbeddingProvider {
  async embed(text: string): Promise<number[]> {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.OPENAI_EMBEDDING_API_KEY ?? ''}`
      },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: text })
    });
    if (!res.ok) throw new Error(`OpenAI embeddings error: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { data: { embedding: number[] }[] };
    return data.data[0].embedding;
  }
}

class VoyageEmbeddingProvider implements EmbeddingProvider {
  async embed(text: string): Promise<number[]> {
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.VOYAGE_API_KEY ?? ''}`
      },
      body: JSON.stringify({ model: 'voyage-3', input: [text] })
    });
    if (!res.ok) throw new Error(`Voyage embeddings error: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { data: { embedding: number[] }[] };
    return data.data[0].embedding;
  }
}

class LocalEmbeddingProvider implements EmbeddingProvider {
  async embed(text: string): Promise<number[]> {
    const url = process.env.LOCAL_EMBEDDING_URL;
    if (!url) throw new Error('LOCAL_EMBEDDING_URL is not set');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: text })
    });
    if (!res.ok) throw new Error(`Local embedding server error: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { embedding: number[] };
    return data.embedding;
  }
}

export function createEmbeddingProvider(
  providerName: string = process.env.EMBEDDING_PROVIDER ?? 'openai'
): EmbeddingProvider {
  switch (providerName) {
    case 'openai':
      return new OpenAIEmbeddingProvider();
    case 'voyage':
      return new VoyageEmbeddingProvider();
    case 'local':
      return new LocalEmbeddingProvider();
    default:
      throw new Error(`unknown embedding provider: ${providerName}`);
  }
}
