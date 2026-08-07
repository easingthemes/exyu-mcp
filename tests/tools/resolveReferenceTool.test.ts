import { describe, it, expect, vi, beforeEach } from 'vitest';
import pg from 'pg';

vi.mock('../../src/tools/resolveReference.js', () => ({
  resolveReference: vi.fn()
}));

import { resolveReference } from '../../src/tools/resolveReference.js';
import { handleResolveReference, resolveReferenceToolDefinition } from '../../src/tools/resolveReferenceTool.js';

const fakeDb = {
  query: vi.fn().mockResolvedValue({ rows: [] })
} as unknown as pg.Pool;

describe('resolveReferenceToolDefinition', () => {
  it('is marked read-only and describes broad ex-YU scope', () => {
    expect(resolveReferenceToolDefinition.annotations?.readOnlyHint).toBe(true);
    expect(resolveReferenceToolDefinition.description).toMatch(/ex-YU/i);
  });
});

describe('handleResolveReference', () => {
  beforeEach(() => {
    vi.mocked(resolveReference).mockReset();
    vi.mocked(fakeDb.query).mockClear();
  });

  it('returns structured content and logs a hit to tool_calls', async () => {
    vi.mocked(resolveReference).mockResolvedValue({
      matches: [
        {
          ref: { id: 'ref-uuid', external_id: 'ref_valter_vazduh_trepti', canonical_text: 'Vazduh trepti...', source_type: 'movie', function: 'recognition_code' },
          confidence: 0.9,
          leg: 'trigram'
        }
      ]
    });

    const result = await handleResolveReference('Vazduh gori ko da...', {
      db: fakeDb,
      embedder: { embed: vi.fn() }
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(JSON.parse(text).matches[0].ref.external_id).toBe('ref_valter_vazduh_trepti');
    expect(fakeDb.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO tool_calls'),
      expect.arrayContaining(['Vazduh gori ko da...', 'ref-uuid', 0.9])
    );
  });

  it('returns a self-healing not-found message and logs a miss', async () => {
    vi.mocked(resolveReference).mockResolvedValue({ matches: [] });

    const result = await handleResolveReference('totally unknown phrase', {
      db: fakeDb,
      embedder: { embed: vi.fn() }
    });

    const text = (result.content[0] as { type: 'text'; text: string }).text;
    const parsed = JSON.parse(text);
    expect(parsed.matches).toEqual([]);
    expect(parsed.note).toMatch(/no confident match/i);
    expect(fakeDb.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO tool_calls'),
      expect.arrayContaining(['totally unknown phrase', null, null])
    );
  });
});
