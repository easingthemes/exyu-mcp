import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import type { ReferenceRecord } from '../types/reference.js';

const AjvClass = Ajv as any;
const ajv = new AjvClass({ allErrors: true, strict: true });
(addFormats as any)(ajv);

const schema = JSON.parse(readFileSync(new URL('../../schema/reference.schema.json', import.meta.url), 'utf-8'));
const validateFn = ajv.compile(schema);

export function validateRecord(record: unknown): ReferenceRecord {
  const valid = validateFn(record);
  if (!valid) {
    throw new Error(`schema validation failed: ${JSON.stringify(validateFn.errors)}`);
  }
  return record as ReferenceRecord;
}
