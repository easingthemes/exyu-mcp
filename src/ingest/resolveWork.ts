import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

export interface WorkSkeletonEntry {
  title: string;
  year?: number;
  wikidata_qid?: string | null;
  musicbrainz_mbid?: string | null;
}

export function loadSkeleton(filePath: string): WorkSkeletonEntry[] {
  const doc = parse(readFileSync(filePath, 'utf-8')) as { works: WorkSkeletonEntry[] };
  return doc.works;
}

export function resolveWork(
  workRef: { title: string; year?: number },
  skeleton: WorkSkeletonEntry[]
): WorkSkeletonEntry | null {
  const normalizedTitle = workRef.title.trim().toLowerCase();
  const match = skeleton.find(
    (w) =>
      w.title.trim().toLowerCase() === normalizedTitle &&
      (workRef.year === undefined || w.year === workRef.year)
  );
  return match ?? null;
}
