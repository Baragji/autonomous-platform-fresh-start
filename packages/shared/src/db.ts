import { Pool } from 'pg';
import { env } from './env';

export const pool = new Pool({ connectionString: env.DATABASE_URL });

export async function initDb() {
  // No-op: schema created by infra init.sql
  await pool.query('SELECT 1');
}

export async function upsertExecution(id: string, status: string, intent: string, currentAgent?: string) {
  await pool.query(
    `INSERT INTO executions (id, user_intent, status, current_agent)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, current_agent = EXCLUDED.current_agent, updated_at = NOW()`,
    [id, intent, status, currentAgent || null]
  );
}

export async function getExecution(id: string) {
  const { rows } = await pool.query('SELECT * FROM executions WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function insertCheckpoint(
  threadId: string,
  checkpointId: string,
  checkpoint: Record<string, unknown>,
  parentId?: string
) {
  await pool.query(
    `INSERT INTO checkpoints (thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id, checkpoint, metadata)
     VALUES ($1,'', $2, $3, $4, '{}')`,
    [threadId, checkpointId, parentId || null, checkpoint]
  );
}
