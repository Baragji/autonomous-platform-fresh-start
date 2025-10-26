import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';

async function main() {
  const sqlPath = path.resolve('infrastructure', 'postgres', 'init.sql');
  const sql = readFileSync(sqlPath, 'utf-8');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://umca:umcapassword@localhost:5432/umca' });
  try {
    await pool.query(sql);
    console.log('db-init ok');
  } finally {
    await pool.end();
  }
}

main().catch((e) => { console.error(e?.message || e); process.exit(1); });

