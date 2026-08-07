import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createChatProvider } from '../../src/providers/chat.js';

describe('createChatProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls the Anthropic messages endpoint and returns text', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: 'hello from claude' }] })
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = createChatProvider('anthropic');
    const result = await provider.complete('ping');

    expect(result).toBe('hello from claude');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('throws a clear error for an unknown provider name', () => {
    expect(() => createChatProvider('made-up')).toThrow(/unknown chat provider/i);
  });
});
