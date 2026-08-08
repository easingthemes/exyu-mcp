import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEmbeddingProvider } from '../../src/providers/embedding.js';

describe('createEmbeddingProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls the OpenAI embeddings endpoint and returns a vector', async () => {
    process.env.OPENAI_EMBEDDING_API_KEY = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }] })
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = createEmbeddingProvider('openai');
    const vec = await provider.embed('vazduh trepti');

    expect(vec).toEqual([0.1, 0.2, 0.3]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/embeddings',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('throws a clear error for an unknown provider name', () => {
    expect(() => createEmbeddingProvider('made-up')).toThrow(/unknown embedding provider/i);
  });
});
