export type Confidence = 'low' | 'medium' | 'high';

export interface WorkRef {
  title: string;
  year?: number;
  wikidata_qid?: string | null;
  release?: string;
  musicbrainz_mbid?: string | null;
}

export interface SourceCitation {
  source_id: string;
  source_type: string;
  url?: string;
  license: string;
  retrieved_at: string;
  confidence: Confidence;
  field: string | string[];
}

export interface RelatedEdge {
  rel_type: string;
  ref?: string;
  note?: string;
}

export interface ReferenceExtension {
  call_response?: { sign: string; countersign: string };
  performer?: string;
  line_index?: number;
  [key: string]: unknown;
}

export interface ReferenceRecord {
  id: string;
  source_type: string;
  canonical_text: string;
  normalized_text: string;
  variants: string[];
  work?: WorkRef | null;
  function: string;
  extension?: ReferenceExtension;
  speaker?: { name: string; confidence: Confidence } | null;
  timestamp_start?: string | null;
  timestamp_end?: string | null;
  meaning?: string;
  emotional_tone?: string[];
  modern_usage?: string;
  cultural_weight?: number | null;
  signals?: Record<string, unknown>;
  gap_score?: number | null;
  gap_notes?: string;
  related?: RelatedEdge[];
  sources: SourceCitation[];
}
