import fs from 'node:fs';
import path from 'node:path';
import { pool } from '@autonomous/shared/src/db';

async function main() {
  const sqlPath = path.resolve('infrastructure', 'postgres', 'init.sql');
  const ddl = fs.readFileSync(sqlPath, 'utf-8');
  // naive splitter on semicolons; ignore empty statements
  const stmts = ddl
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const s of stmts) {
    try {
      await pool.query(s);
    } catch (e) {
      // tolerate idempotent failures (e.g., creating existing roles)
      process.stderr.write(`init-db warn: ${(e as Error).message}\n`);
    }
  }

  // Idempotent bootstrap for LangGraph/Postgres checkpointer migrations table
  try {
    await pool.query('CREATE TABLE IF NOT EXISTS public.checkpoint_migrations (v INTEGER PRIMARY KEY)');
  } catch (e) {
    process.stderr.write(`init-db warn: ${(e as Error).message}\n`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
