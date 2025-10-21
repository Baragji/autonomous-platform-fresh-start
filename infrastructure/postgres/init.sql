-- Week 1 DoD: Database Schema (LOCKED)
-- checkpoints (LangGraph requirement)
CREATE TABLE IF NOT EXISTS checkpoints (
  thread_id TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  checkpoint_id TEXT NOT NULL,
  parent_checkpoint_id TEXT,
  checkpoint JSONB NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
);

-- executions (UI tracking)
CREATE TABLE IF NOT EXISTS executions (
  id TEXT PRIMARY KEY,
  user_intent TEXT NOT NULL,
  status TEXT NOT NULL, -- 'planning', 'implementing', etc.
  current_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Indexes per RESPONSE_TO_GPT5_VALIDATION.md
CREATE INDEX IF NOT EXISTS idx_checkpoints_parent ON checkpoints(parent_checkpoint_id);
CREATE INDEX IF NOT EXISTS idx_checkpoints_created_at ON checkpoints(created_at);
CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);
CREATE INDEX IF NOT EXISTS idx_executions_created_at ON executions(created_at);

-- Permissions (owner is POSTGRES_USER=umca during init)
GRANT USAGE ON SCHEMA public TO umca;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO umca;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO umca;

