import { describe, it, expect } from 'vitest';
import { resolveWork, loadSkeleton, type WorkSkeletonEntry } from '../../src/ingest/resolveWork.js';

const skeleton: WorkSkeletonEntry[] = [
  { title: 'Valter brani Sarajevo', year: 1972, wikidata_qid: null },
  { title: 'Maratonci trče počasni krug', year: 1982, wikidata_qid: null }
];

describe('resolveWork', () => {
  it('matches by exact title and year', () => {
    const match = resolveWork({ title: 'Valter brani Sarajevo', year: 1972 }, skeleton);
    expect(match).not.toBeNull();
    expect(match?.title).toBe('Valter brani Sarajevo');
  });

  it('is case-insensitive', () => {
    const match = resolveWork({ title: 'valter brani sarajevo', year: 1972 }, skeleton);
    expect(match).not.toBeNull();
  });

  it('returns null when nothing matches', () => {
    const match = resolveWork({ title: 'Unknown Film' }, skeleton);
    expect(match).toBeNull();
  });
});

describe('loadSkeleton', () => {
  it('loads the real skeleton/works.yaml with at least one entry', () => {
    const entries = loadSkeleton('skeleton/works.yaml');
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0]).toHaveProperty('title');
  });
});
