import { describe, it, expect, beforeAll } from 'vitest';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from 'yaml';
import { join } from 'node:path';

const ajv = new (Ajv as any)({ allErrors: true, strict: true });
(addFormats as any)(ajv);

let validate: ReturnType<typeof ajv.compile>;

beforeAll(() => {
  const schema = JSON.parse(readFileSync('schema/reference.schema.json', 'utf-8'));
  validate = ajv.compile(schema);
});

const archetypeDirs = ['film', 'music', 'slang', 'meme'];

describe('reference schema validates all four archetypes', () => {
  for (const dir of archetypeDirs) {
    const dirPath = join('records', dir);
    const files = readdirSync(dirPath).filter((f) => f.endsWith('.yaml'));
    for (const file of files) {
      it(`validates records/${dir}/${file}`, () => {
        const record = parse(readFileSync(join(dirPath, file), 'utf-8'));
        const valid = validate(record);
        expect(valid, JSON.stringify(validate.errors)).toBe(true);
      });
    }
  }
});
