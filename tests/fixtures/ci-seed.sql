-- Seed for the CI Compose-level HTTP smoke test.
--
-- CI has no embedding-provider credentials, so we cannot run the real ingest CLI.
-- This inserts the Valter record's trigram/FTS-relevant columns directly (embedding
-- left NULL) — enough for resolve_reference's trigram leg to produce a fully-cited
-- match, which is what the transport smoke test needs to assert against.

INSERT INTO works (title, year)
VALUES ('Valter brani Sarajevo', 1972)
ON CONFLICT (title, year) DO NOTHING;

INSERT INTO refs (external_id, source_type, canonical_text, normalized_text, function,
                  work_id, extension, speaker, enrichment, signals, gap)
SELECT 'ref_valter_vazduh_trepti',
       'movie',
       'Vazduh trepti, kao da nebo gori.',
       'vazduh trepti kao da nebo gori',
       'recognition_code',
       w.id,
       '{"call_response":{"sign":"Vazduh trepti, kao da nebo gori.","countersign":"unverified"}}'::jsonb,
       '{"name":"unknown","confidence":"low"}'::jsonb,
       '{"meaning":"A partizan recognition password used to identify contacts.","emotional_tone":["tense","ominous"],"modern_usage":"Stock set-phrase for something dramatic brewing."}'::jsonb,
       '{}'::jsonb,
       '{}'::jsonb
FROM works w
WHERE w.title = 'Valter brani Sarajevo' AND w.year = 1972
ON CONFLICT (external_id) DO NOTHING;

INSERT INTO variants (ref_id, variant_text, normalized_variant)
SELECT r.id, 'Vazduh gori ko da...', 'vazduh gori ko da...'
FROM refs r
WHERE r.external_id = 'ref_valter_vazduh_trepti'
  AND NOT EXISTS (SELECT 1 FROM variants v WHERE v.ref_id = r.id);

INSERT INTO sources (ref_id, field, source_id, source_type, license, retrieved_at, confidence)
SELECT r.id, 'work', 'yugonostalgia', 'culture_site', 'unknown', '2026-08-07', 'low'
FROM refs r
WHERE r.external_id = 'ref_valter_vazduh_trepti'
  AND NOT EXISTS (SELECT 1 FROM sources s WHERE s.ref_id = r.id);
