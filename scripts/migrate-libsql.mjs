#!/usr/bin/env node
/**
 * Apply Prisma SQL migrations to a libSQL/Turso database.
 *
 * `prisma migrate deploy` does not speak the libSQL HTTP protocol, so we
 * read each migration directory in order and execute its `migration.sql`
 * via the official @libsql/client. State is tracked in a
 * `_prisma_migrations` table so we don't re-apply on every boot.
 *
 * Env required:
 *   TURSO_DATABASE_URL   libsql://... (or file: for local)
 *   TURSO_AUTH_TOKEN     bearer token for Turso
 *
 * If TURSO_DATABASE_URL is unset, this script is a no-op (local dev uses
 * `prisma db push` against the better-sqlite3 adapter).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createClient } from '@libsql/client';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'prisma', 'migrations');

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  console.log('[migrate-libsql] TURSO_DATABASE_URL not set — skipping (dev mode).');
  process.exit(0);
}

const client = createClient({ url, authToken });

async function ensureMigrationsTable() {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS _prisma_migrations (
      id TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      finished_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      migration_name TEXT NOT NULL,
      logs TEXT,
      rolled_back_at DATETIME,
      started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      applied_steps_count INTEGER NOT NULL DEFAULT 0
    )
  `);
}

async function appliedSet() {
  const result = await client.execute('SELECT migration_name FROM _prisma_migrations WHERE rolled_back_at IS NULL');
  return new Set(result.rows.map((r) => r.migration_name));
}

function listMigrationDirs() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => {
      const full = path.join(MIGRATIONS_DIR, name);
      return statSync(full).isDirectory();
    })
    .sort();
}

function splitStatements(sql) {
  // Strip block + line comments, then split on ';' boundaries that aren't
  // inside a string literal. Prisma migration SQL doesn't use multi-line
  // strings, so a naive split is enough.
  const cleaned = sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*\n/g, '\n');
  return cleaned
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function applyMigration(name) {
  const sqlPath = path.join(MIGRATIONS_DIR, name, 'migration.sql');
  const sql = readFileSync(sqlPath, 'utf8');
  const checksum = createHash('sha256').update(sql).digest('hex');
  const statements = splitStatements(sql);

  console.log(`[migrate-libsql] Applying ${name} (${statements.length} statements)`);

  for (const stmt of statements) {
    try {
      await client.execute(stmt);
    } catch (err) {
      console.error(`[migrate-libsql] FAILED on statement:\n${stmt}\n`);
      throw err;
    }
  }

  await client.execute({
    sql: `INSERT INTO _prisma_migrations (id, checksum, migration_name, applied_steps_count)
          VALUES (?, ?, ?, ?)`,
    args: [name, checksum, name, statements.length],
  });

  console.log(`[migrate-libsql] OK ${name}`);
}

async function main() {
  await ensureMigrationsTable();
  const already = await appliedSet();
  const dirs = listMigrationDirs();
  const pending = dirs.filter((d) => !already.has(d));

  if (pending.length === 0) {
    console.log(`[migrate-libsql] No pending migrations (${dirs.length} total, all applied).`);
    return;
  }

  console.log(`[migrate-libsql] ${pending.length} pending migration(s) to apply.`);
  for (const name of pending) {
    await applyMigration(name);
  }
  console.log(`[migrate-libsql] Done. Applied ${pending.length} migration(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[migrate-libsql] FAILED:', err);
    process.exit(1);
  });
