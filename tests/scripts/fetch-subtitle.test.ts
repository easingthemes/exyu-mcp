import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchSubtitle } from '../../scripts/fetch-subtitle.js';

describe('searchSubtitle', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the top search result file id and release name', async () => {
    process.env.OPENSUBTITLES_API_KEY = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            attributes: {
              release: 'Valter.Brani.Sarajevo.1972.BDRip',
              files: [{ file_id: 12345 }]
            }
          }
        ]
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await searchSubtitle({ title: 'Valter brani Sarajevo', year: 1972, language: 'sr' });

    expect(result).toEqual({ fileId: 12345, releaseName: 'Valter.Brani.Sarajevo.1972.BDRip' });
  });

  it('returns null when no results are found', async () => {
    process.env.OPENSUBTITLES_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) }));

    const result = await searchSubtitle({ title: 'Nonexistent Film', year: 1999, language: 'sr' });

    expect(result).toBeNull();
  });
});
