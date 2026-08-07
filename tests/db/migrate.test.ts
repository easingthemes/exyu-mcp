// tests/db/migrate.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { runMigrations } from '../../src/db/migrate.js';

let container: StartedPostgreSqlContainer;
let client: pg.Client;

beforeAll(async () => {
  container = await new PostgreSqlContainer('pgvector/pgvector:pg16')
    .withDatabase('exyu')
    .withUsername('exyu')
    .withPassword('exyu')
    .start();
  client = new pg.Client({ connectionString: container.getConnectionUri() });
  await client.connect();
  await runMigrations(client as unknown as pg.Pool);
}, 60_000);

afterAll(async () => {
  await client.end();
  await container.stop();
});

describe('001_init migration', () => {
  it('creates all expected tables', async () => {
    const res = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
    );
    const names = res.rows.map((r) => r.table_name);
    expect(names).toEqual(
      expect.arrayContaining(['works', 'refs', 'variants', 'refs_edges', 'sources', 'tool_calls'])
    );
  });

  it('enables pgvector and pg_trgm extensions', async () => {
    const res = await client.query(`SELECT extname FROM pg_extension`);
    const names = res.rows.map((r) => r.extname);
    expect(names).toEqual(expect.arrayContaining(['vector', 'pg_trgm']));
  });
});
