import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';
import type { ReferenceRecord } from '../types/reference.js';

const AjvClass = Ajv as any;
const ajv = new AjvClass({ allErrors: true, strict: true });
(addFormats as any)(ajv);

/**
 * Locate `schema/reference.schema.json`.
 *
 * `process.cwd()` is the primary candidate because it is correct in both contexts that
 * matter: npm always runs scripts with cwd set to the package root, and the Docker image
 * uses `WORKDIR /app` with the schema copied to `/app/schema`. The module-relative
 * fallbacks keep a bare `node /abs/path/dist/src/ingest/validate.js` working from an
 * arbitrary cwd, and cover both the source layout (`src/ingest` -> repo root) and the
 * compiled layout (`dist/src/ingest` -> app root; note tsconfig's `rootDir: "."` means
 * this file compiles to `dist/src/ingest/`, one level deeper than the source).
 */
function resolveSchemaPath(): string {
  const candidates = [
    join(process.cwd(), 'schema', 'reference.schema.json'),
    fileURLToPath(new URL('../../schema/reference.schema.json', import.meta.url)),
    fileURLToPath(new URL('../../../schema/reference.schema.json', import.meta.url))
  ];
  const found = candidates.find((c) => existsSync(c));
  if (!found) {
    throw new Error(`Could not locate schema/reference.schema.json. Looked in:\n  ${candidates.join('\n  ')}`);
  }
  return found;
}

const schema = JSON.parse(readFileSync(resolveSchemaPath(), 'utf-8'));
const validateFn = ajv.compile(schema);

export function validateRecord(record: unknown): ReferenceRecord {
  const valid = validateFn(record);
  if (!valid) {
    throw new Error(`schema validation failed: ${JSON.stringify(validateFn.errors)}`);
  }
  return record as ReferenceRecord;
}

/** Validate a single YAML record file. Returns the parsed record or throws. */
export function validateFile(filePath: string): ReferenceRecord {
  return validateRecord(parse(readFileSync(filePath, 'utf-8')));
}

/** All `*.yaml` files under `records/`, recursively, sorted. */
export function findRecordFiles(rootDir = join(process.cwd(), 'records')): string[] {
  if (!existsSync(rootDir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    const full = join(rootDir, entry.name);
    if (entry.isDirectory()) out.push(...findRecordFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.yaml')) out.push(full);
  }
  return out.sort();
}

// CLI: `npm run validate [-- <file>...]`
// With no arguments, validates every record under `records/`.
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const files = args.length > 0 ? args : findRecordFiles();

  if (files.length === 0) {
    console.error('No record files to validate (no arguments given and records/ is empty or missing).');
    process.exit(1);
  }

  let failures = 0;
  for (const file of files) {
    const label = relative(process.cwd(), file) || file;
    try {
      validateFile(file);
      console.log(`ok    ${label}`);
    } catch (err) {
      failures++;
      console.error(`FAIL  ${label}`);
      console.error(`      ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`\n${files.length - failures}/${files.length} record(s) valid.`);
  if (failures > 0) process.exit(1);
}
