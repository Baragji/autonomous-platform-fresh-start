# AI Builder Instructions: Vertical Slice #1

**Audience:** AI agents (Claude, GPT, etc.) building this system
**Context:** User is non-technical, using AI to build AI system
**Goal:** Complete Week 1-8 implementation from VERTICAL_1_PLAN.md

---

## 🎯 Your Mission

Build a **fully autonomous AI coding system** that can:
1. Accept user request: "Build a TODO API with tests"
2. Generate working code automatically
3. Run tests automatically
4. Fix failures automatically (up to 3 attempts)
5. Return working code with zero human intervention

**Success = User gets working code without writing a single line themselves.**

---

## 📐 Architecture You're Building

```
User Request → Gateway → MCA → Planner → Implementer → Runner → Validator → Result
```

**5 Microservices (independent packages):**
1. **Gateway** - REST API (receives user requests)
2. **MCA** - Smart coordinator (routes work to specialists)
3. **Planner** - Breaks requests into tasks
4. **Implementer** - Generates code
5. **Runner** - Runs tests in isolated sandbox
6. **Validator** - Independently verifies everything works

**Infrastructure:**
- Postgres (state storage, resume/retry)
- Redis (message bus between services)
- MinIO (artifact storage - code, test results, etc.)
- OpenTelemetry + Tempo + Grafana (observability)
- Langfuse (LLM cost tracking)

---

## 🛠️ Technology Stack (LOCKED)

**All agents use OpenAI (GPT-4o or GPT-5):**
- MCA: GPT-4o/GPT-5 (smart routing)
- Planner: GPT-4o + Structured Outputs
- Implementer: GPT-4o + Function Calling (NOT Anthropic)
- Validator: GPT-4o + Structured Outputs

**Why OpenAI-only:**
- User has OpenAI credits
- Targeting GPT-5 when available
- Multi-vendor portability (can add Anthropic/Gemini later)

**Infrastructure:**
- Node.js 20+ with TypeScript
- Express (REST API)
- LangGraph JS (MCA orchestration)
- E2B Sandbox (test execution)
- Postgres, Redis, MinIO (self-hosted via Docker)

---

## 📚 Reference Documents (READ THESE FIRST)

**Before you start any week, read:**

1. **ARCHITECTURE_DECISION.md** - Why Smart MCA architecture
2. **VERTICAL_1_TOOLING.md** - Production tools for each component (UPDATE: use OpenAI, not Anthropic)
3. **VERTICAL_1_PLAN.md** - Week-by-week build schedule
4. **umca_RA_part2.md** - OpenAI implementation details (RA's Option B)

**Constitutional Requirements (MUST follow):**
- Production from line 1 (NO stubs, NO fake data)
- Battle-tested tools only (NO custom implementations)
- Microservices from day 1 (NO monoliths)
- Evidence-driven (ALL artifacts stored in MinIO)
- Complete vertical slices (finish ONE feature before starting next)

---

## 🚀 Week 1: Infrastructure Setup

**Goal:** Get Postgres, Redis, MinIO, OpenTelemetry running locally

### Step 1.1: Create Project Structure

**Action:** Create this exact folder structure:

```bash
mkdir -p autonomous-platform
cd autonomous-platform

# Create package directories
mkdir -p packages/gateway/src
mkdir -p packages/mca/src
mkdir -p packages/planner/src
mkdir -p packages/implementer/src
mkdir -p packages/runner/src
mkdir -p packages/validator/src
mkdir -p packages/shared/src

# Create infrastructure directory
mkdir -p infrastructure/postgres
mkdir -p infrastructure/grafana/dashboards
mkdir -p infrastructure/tempo

# Create docs directory
mkdir -p docs
```

**Verification:**
```bash
tree -L 3
# Should show the structure above
```

---

### Step 1.2: Create Root Package Configuration

**Action:** Create `package.json` at root:

**File:** `autonomous-platform/package.json`
```json
{
  "name": "autonomous-platform",
  "version": "0.1.0",
  "private": true,
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck",
    "infra:up": "docker-compose -f infrastructure/docker-compose.yml up -d",
    "infra:down": "docker-compose -f infrastructure/docker-compose.yml down",
    "infra:logs": "docker-compose -f infrastructure/docker-compose.yml logs -f"
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "typescript": "^5.6.0"
  }
}
```

**Why:** Turbo manages the monorepo (builds all packages in parallel)

**Verification:**
```bash
npm install
# Should install turbo successfully
```

---

### Step 1.3: Create Docker Compose for Infrastructure

**Action:** Create `infrastructure/docker-compose.yml`:

**File:** `autonomous-platform/infrastructure/docker-compose.yml`
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: umca-postgres
    environment:
      POSTGRES_USER: umca
      POSTGRES_PASSWORD: umca_dev_password
      POSTGRES_DB: umca
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./postgres/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U umca"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: umca-redis
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  minio:
    image: minio/minio:latest
    container_name: umca-minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin123
    ports:
      - "9000:9000"  # API
      - "9001:9001"  # Console
    volumes:
      - minio-data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 10s
      timeout: 5s
      retries: 3

  tempo:
    image: grafana/tempo:latest
    container_name: umca-tempo
    command: ["-config.file=/etc/tempo.yaml"]
    volumes:
      - ./tempo/tempo.yaml:/etc/tempo.yaml
      - tempo-data:/tmp/tempo
    ports:
      - "4317:4317"  # OTLP gRPC
      - "4318:4318"  # OTLP HTTP
      - "3200:3200"  # Tempo query

  grafana:
    image: grafana/grafana:latest
    container_name: umca-grafana
    environment:
      GF_SECURITY_ADMIN_USER: admin
      GF_SECURITY_ADMIN_PASSWORD: admin123
    ports:
      - "3001:3000"
    volumes:
      - grafana-data:/var/lib/grafana
      - ./grafana/dashboards:/etc/grafana/provisioning/dashboards
    depends_on:
      - tempo

volumes:
  postgres-data:
  redis-data:
  minio-data:
  tempo-data:
  grafana-data:
```

**Why each service:**
- **Postgres**: Stores LangGraph checkpoints (state for resume/retry)
- **Redis**: Message bus between services (agent coordination)
- **MinIO**: Stores all artifacts (code, test results, plans)
- **Tempo**: Trace storage (distributed tracing)
- **Grafana**: Visualization (dashboards, traces, metrics)

**Verification:**
```bash
docker-compose -f infrastructure/docker-compose.yml up -d
docker ps
# Should show 5 running containers
```

---

### Step 1.4: Create Postgres Schema (LangGraph Checkpointer)

**Action:** Create `infrastructure/postgres/init.sql`:

**File:** `autonomous-platform/infrastructure/postgres/init.sql`
```sql
-- LangGraph checkpointer schema
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

CREATE INDEX IF NOT EXISTS idx_checkpoints_parent
  ON checkpoints (parent_checkpoint_id);

CREATE INDEX IF NOT EXISTS idx_checkpoints_created
  ON checkpoints (created_at);

-- Execution tracking (for UI)
CREATE TABLE IF NOT EXISTS executions (
  id TEXT PRIMARY KEY,
  user_intent TEXT NOT NULL,
  status TEXT NOT NULL, -- 'planning', 'implementing', 'running', 'validating', 'completed', 'failed'
  current_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_executions_status
  ON executions (status);

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO umca;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO umca;
```

**Why:** LangGraph needs this schema to save/restore execution state

**Verification:**
```bash
docker exec -it umca-postgres psql -U umca -d umca -c "\dt"
# Should show 'checkpoints' and 'executions' tables
```

---

### Step 1.5: Create Tempo Configuration

**Action:** Create `infrastructure/tempo/tempo.yaml`:

**File:** `autonomous-platform/infrastructure/tempo/tempo.yaml`
```yaml
server:
  http_listen_port: 3200

distributor:
  receivers:
    otlp:
      protocols:
        grpc:
          endpoint: 0.0.0.0:4317
        http:
          endpoint: 0.0.0.0:4318

storage:
  trace:
    backend: local
    local:
      path: /tmp/tempo/blocks
```

**Why:** OpenTelemetry traces go here (distributed tracing for debugging)

---

### Step 1.6: Create Environment Variables Template

**Action:** Create `.env.example`:

**File:** `autonomous-platform/.env.example`
```bash
# LLM APIs
OPENAI_API_KEY=sk-...
# Note: Using OpenAI-only for Vertical #1 (no Anthropic)

# Databases
DATABASE_URL=postgresql://umca:umca_dev_password@localhost:5432/umca
REDIS_URL=redis://localhost:6379

# MinIO (S3-compatible storage)
MINIO_ENDPOINT=http://localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin123

# E2B Sandbox
E2B_API_KEY=e2b_...

# Observability
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...

# App
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug
```

**Action:** Copy and fill in your actual keys:
```bash
cp .env.example .env
# Edit .env with your actual API keys
```

**Verification:**
```bash
cat .env | grep OPENAI_API_KEY
# Should show your actual key (starts with sk-...)
```

---

### Step 1.7: Initialize MinIO Bucket

**Action:** Create the bucket where all artifacts will be stored:

**Script:** `infrastructure/minio-init.sh`
```bash
#!/bin/bash
set -e

echo "Waiting for MinIO to be ready..."
sleep 5

# Install mc (MinIO client) if not present
if ! command -v mc &> /dev/null; then
    wget https://dl.min.io/client/mc/release/linux-amd64/mc
    chmod +x mc
    sudo mv mc /usr/local/bin/
fi

# Configure MinIO client
mc alias set local http://localhost:9000 minioadmin minioadmin123

# Create bucket
mc mb local/umca-artifacts --ignore-existing

# Set public read policy (for artifact URLs)
mc anonymous set download local/umca-artifacts

echo "✅ MinIO bucket 'umca-artifacts' created"
```

**Verification:**
```bash
chmod +x infrastructure/minio-init.sh
./infrastructure/minio-init.sh

# Check bucket exists
mc ls local/
# Should show 'umca-artifacts'
```

---

### Step 1.8: Week 1 Acceptance Criteria Checklist

**Before proceeding to Week 2, verify ALL of these:**

```bash
# ✅ 1. All containers running
docker ps | grep umca
# Should show: postgres, redis, minio, tempo, grafana (5 containers)

# ✅ 2. Postgres has tables
docker exec -it umca-postgres psql -U umca -d umca -c "SELECT COUNT(*) FROM checkpoints;"
# Should return: 0 (table exists, no data yet)

# ✅ 3. Redis responds
docker exec -it umca-redis redis-cli ping
# Should return: PONG

# ✅ 4. MinIO bucket exists
mc ls local/umca-artifacts
# Should return: empty (bucket exists)

# ✅ 5. Grafana accessible
curl -s http://localhost:3001/api/health
# Should return: {"database":"ok",...}

# ✅ 6. Tempo receiving traces
curl -s http://localhost:3200/ready
# Should return: ready

# ✅ 7. Environment variables set
grep -q "sk-" .env && echo "✅ OpenAI key set" || echo "❌ Missing OpenAI key"
```

**If ANY check fails, STOP and fix before proceeding to Week 2.**

---

## 🔄 Week 2: Gateway + MCA + Planner

**Goal:** POST /executions → Planner returns plan.json in MinIO

### Step 2.1: Create Shared Package (Types, Utilities)

**Action:** Create shared types used by all services

**File:** `packages/shared/package.json`
```json
{
  "name": "@umca/shared",
  "version": "0.1.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@aws-sdk/client-s3": "^3.600.0",
    "ioredis": "^5.4.1",
    "pg": "^8.11.5",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@types/pg": "^8.11.6",
    "typescript": "^5.6.0"
  }
}
```

**File:** `packages/shared/tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**File:** `packages/shared/src/types.ts`
```typescript
// Shared types across all services

export type ExecutionStatus =
  | 'pending'
  | 'planning'
  | 'implementing'
  | 'running'
  | 'validating'
  | 'completed'
  | 'failed';

export interface Execution {
  id: string;
  user_intent: string;
  status: ExecutionStatus;
  current_agent?: string;
  created_at: Date;
  updated_at: Date;
  completed_at?: Date;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  command?: string;
  depends_on?: string[];
}

export interface Plan {
  tasks: Task[];
  acceptance_criteria: string[];
}

export interface ValidationResult {
  verdict: 'PASS' | 'FAIL';
  reason: string;
  issues: Array<{
    type: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    description: string;
    remediation: string;
  }>;
  cost: number;
}
```

**File:** `packages/shared/src/minio.ts`
```typescript
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT || "http://localhost:9000",
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY || "minioadmin",
    secretAccessKey: process.env.MINIO_SECRET_KEY || "minioadmin123",
  },
  region: "us-east-1", // MinIO doesn't care, but SDK requires it
  forcePathStyle: true, // Required for MinIO
});

const BUCKET = "umca-artifacts";

export async function uploadArtifact(
  key: string,
  content: string | Buffer,
  contentType = "application/json"
): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: content,
      ContentType: contentType,
    })
  );

  return `${process.env.MINIO_ENDPOINT}/${BUCKET}/${key}`;
}

export async function downloadArtifact(key: string): Promise<string> {
  const response = await s3.send(
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
    })
  );

  return await response.Body!.transformToString();
}
```

**File:** `packages/shared/src/index.ts`
```typescript
export * from "./types";
export * from "./minio";
```

**Verification:**
```bash
cd packages/shared
npm install
npm run build
# Should create dist/ folder with compiled .js and .d.ts files
```

---

### Step 2.2: Create Gateway Service

**File:** `packages/gateway/package.json`
```json
{
  "name": "@umca/gateway",
  "version": "0.1.0",
  "main": "./dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@umca/shared": "*",
    "express": "^4.19.2",
    "ioredis": "^5.4.1",
    "pg": "^8.11.5",
    "uuid": "^10.0.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^20.14.0",
    "@types/uuid": "^10.0.0",
    "tsx": "^4.15.0",
    "typescript": "^5.6.0"
  }
}
```

**File:** `packages/gateway/tsconfig.json`
```json
{
  "extends": "../shared/tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

**File:** `packages/gateway/src/index.ts`
```typescript
import express from "express";
import { Pool } from "pg";
import Redis from "ioredis";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";

const app = express();
app.use(express.json());

// Database connections
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL);

// Request schema
const ExecuteRequestSchema = z.object({
  intent: z.string().min(10).max(5000),
});

// POST /executions - Create new execution
app.post("/api/executions", async (req, res) => {
  try {
    const { intent } = ExecuteRequestSchema.parse(req.body);
    const id = `exec-${uuidv4()}`;

    // Store in database
    await db.query(
      `INSERT INTO executions (id, user_intent, status, current_agent, created_at, updated_at)
       VALUES ($1, $2, 'pending', 'mca', NOW(), NOW())`,
      [id, intent]
    );

    // Publish to Redis (MCA will pick it up)
    await redis.xadd(
      "executions:new",
      "*",
      "execution_id", id,
      "intent", intent,
      "timestamp", Date.now().toString()
    );

    res.status(202).json({
      id,
      status: "accepted",
      location: `/api/executions/${id}`,
      stream: `/api/executions/${id}/stream`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error("Error creating execution:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /executions/:id - Get execution status
app.get("/api/executions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `SELECT * FROM executions WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Execution not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching execution:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /executions/:id/stream - SSE stream of execution events
app.get("/api/executions/:id/stream", async (req, res) => {
  const { id } = req.params;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  // Subscribe to execution events from Redis
  const subscriber = new Redis(process.env.REDIS_URL);
  await subscriber.subscribe(`execution:${id}:events`);

  subscriber.on("message", (channel, message) => {
    res.write(`event: update\ndata: ${message}\n\n`);
  });

  req.on("close", () => {
    subscriber.quit();
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Gateway listening on http://localhost:${PORT}`);
});
```

**Why this code:**
- Accepts POST /executions with user intent
- Stores in Postgres (for persistence)
- Publishes to Redis stream (for MCA to pick up)
- Returns 202 Accepted (async processing)
- Provides SSE endpoint for real-time updates

**Verification:**
```bash
cd packages/gateway
npm install
npm run dev
# Should start on http://localhost:3000

# Test in another terminal:
curl -X POST http://localhost:3000/api/executions \
  -H "Content-Type: application/json" \
  -d '{"intent": "Build a simple calculator API"}'

# Should return:
# {"id":"exec-...","status":"accepted","location":"/api/executions/exec-...","stream":"..."}
```

---

## ⚠️ CRITICAL NOTES FOR AI BUILDERS

### DO NOT:
- ❌ Skip verification steps
- ❌ Assume code works without testing
- ❌ Create "placeholder" or "stub" implementations
- ❌ Proceed to next week if current week fails acceptance criteria
- ❌ Modify architecture without user approval

### DO:
- ✅ Run verification commands after EVERY step
- ✅ Copy code EXACTLY as written (don't paraphrase)
- ✅ Report errors immediately with full output
- ✅ Store ALL artifacts in MinIO (not filesystem)
- ✅ Use OpenAI for all LLM calls (not Anthropic)

---

## 📞 When to Escalate to User

**Escalate immediately if:**
1. Any verification step fails after retry
2. Docker containers won't start
3. Database migrations fail
4. API keys are invalid/missing
5. Cost exceeds $2/execution
6. Architecture decision needed (not in docs)

**Format for escalation:**
```
🚨 ESCALATION REQUIRED

Week: [X]
Step: [X.X]
Issue: [Clear description]
What I tried: [Commands run]
Error output: [Exact error]
Proposed solution: [Your suggestion]
```

---

## 📊 Progress Tracking

After each week, update this checklist:

- [ ] Week 1: Infrastructure (Postgres, Redis, MinIO, Grafana)
- [ ] Week 2: Gateway + MCA + Planner
- [ ] Week 3-4: Implementer + VFS + Streaming
- [ ] Week 5-6: Runner + E2B + Test execution
- [ ] Week 7-8: Validator + Remediation loops + End-to-end

**Current Status:** Ready to start Week 1

---

## 🎓 Learning Resources for AI Builders

**If you encounter unfamiliar concepts:**

1. **LangGraph**: https://langchain-ai.github.io/langgraph/
2. **OpenAI Function Calling**: https://platform.openai.com/docs/guides/function-calling
3. **E2B Sandbox**: https://e2b.dev/docs
4. **Docker Compose**: https://docs.docker.com/compose/
5. **OpenTelemetry**: https://opentelemetry.io/docs/

**User is non-technical:** Explain technical decisions in simple terms when reporting progress.

---

## ✅ Ready to Build?

**Next Action:** Start Week 1, Step 1.1 (Create Project Structure)

**Command to run:**
```bash
mkdir -p autonomous-platform && cd autonomous-platform
# Then follow Step 1.1 exactly
```
