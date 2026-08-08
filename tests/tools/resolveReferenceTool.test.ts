import { describe, it, expect, vi, beforeEach } from 'vitest';
import pg from 'pg';

vi.mock('../../src/tools/resolveReference.js', () => ({
  resolveReference: vi.fn()
}));

import { resolveReference, type MatchedRef } from '../../src/tools/resolveReference.js';
import { handleResolveReference, resolveReferenceToolDefinition } from '../../src/tools/resolveReferenceTool.js';

const fakeDb = {
  query: vi.fn().mockResolvedValue({ rows: [] })
} as unknown as pg.Pool;

const hydratedRef: MatchedRef = {
  id: 'ref-uuid',
  external_id: 'ref_valter_vazduh_trepti',
  canonical_text: 'Vazduh trepti...',
  normalized_text: 'vazduh trepti',
  source_type: 'movie',
  function: 'recognition_code',
  work: { title: 'Valter brani Sarajevo', year: 1972, wikidata_qid: null, musicbrainz_mbid: null },
  speaker: { name: 'unknown', confidence: 'low' },
  timestamp_start: null,
  timestamp_end: null,
  extension: { call_response: { sign: 'Vazduh trepti...', countersign: 'unverified' } },
  meaning: 'A partizan recognition password.',
  emotional_tone: ['tense'],
  modern_usage: 'Stock set-phrase.',
  sources: [
    {
      source_id: 'yugonostalgia',
      source_type: 'culture_site',
      url: null,
      license: 'unknown',
      retrieved_at: '2026-08-07',
      confidence: 'low',
      field: 'work'
    }
  ]
};

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
      matches: [{ ref: hydratedRef, confidence: 0.9, leg: 'trigram' }]
    });

    const result = await handleResolveReference('Vazduh gori ko da...', {
      db: fakeDb,
      embedder: { embed: vi.fn() }
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    const parsed = JSON.parse(text);
    expect(parsed.matches[0].ref.external_id).toBe('ref_valter_vazduh_trepti');
    expect(parsed.matches[0].ref.work.title).toBe('Valter brani Sarajevo');
    expect(parsed.matches[0].ref.sources).toHaveLength(1);
    expect(fakeDb.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO tool_calls'),
      expect.arrayContaining(['Vazduh gori ko da...', 'ref-uuid', 0.9])
    );
  });

  it('still returns the match when tool_calls logging fails', async () => {
    vi.mocked(resolveReference).mockResolvedValue({
      matches: [{ ref: hydratedRef, confidence: 0.9, leg: 'trigram' }]
    });
    vi.mocked(fakeDb.query).mockRejectedValueOnce(new Error('relation "tool_calls" does not exist'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await handleResolveReference('Vazduh gori ko da...', {
      db: fakeDb,
      embedder: { embed: vi.fn() }
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);
    expect(parsed.matches[0].ref.external_id).toBe('ref_valter_vazduh_trepti');
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('distinguishes a degraded lookup from a genuine miss', async () => {
    vi.mocked(resolveReference).mockResolvedValue({ matches: [], degraded: true });

    const result = await handleResolveReference('anything', { db: fakeDb, embedder: { embed: vi.fn() } });

    const parsed = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);
    expect(parsed.matches).toEqual([]);
    expect(parsed.degraded).toBe(true);
    expect(parsed.note).toMatch(/could not check/i);
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
