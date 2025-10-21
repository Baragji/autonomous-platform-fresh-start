# Week 1: Infrastructure DoD (Definition of Done)

**Status:** READY TO EXECUTE
**Duration:** 3-5 days
**Phase:** Vertical Slice #1 - Foundation
**Constitutional Authority:** CONSTITUTION.md Article I, V, IX

---

## 🎯 Mission

**Outcome:** Infrastructure services running locally, validated, production-ready.

**Success Definition:** All acceptance criteria PASS (binary gates).

---

## 📋 Acceptance Criteria (BINARY GATES - Must ALL Pass)

### G1-INFRA: Infrastructure Services Running

```bash
# Test command (run this to verify success):
docker ps --filter "name=umca-" --format "{{.Names}}\t{{.Status}}"

# Expected output (5 services, all "Up"):
umca-postgres   Up X minutes (healthy)
umca-redis      Up X minutes (healthy)
umca-minio      Up X minutes (healthy)
umca-tempo      Up X minutes
umca-grafana    Up X minutes
```

**PASS Criteria:**
- ✅ All 5 containers running
- ✅ All healthchecks passing (postgres, redis, minio)
- ✅ No error logs in `docker logs umca-*`

**FAIL Criteria:**
- ❌ Any container exited/restarting
- ❌ Any healthcheck failing
- ❌ Error logs present

---

### G2-DB: Database Schema Created

```bash
# Test command:
docker exec -it umca-postgres psql -U umca -d umca -c "\dt"

# Expected output:
             List of relations
 Schema |     Name      | Type  | Owner
--------+---------------+-------+-------
 public | checkpoints   | table | umca
 public | executions    | table | umca
```

**PASS Criteria:**
- ✅ `checkpoints` table exists
- ✅ `executions` table exists
- ✅ Both tables have correct columns (verify with `\d checkpoints` and `\d executions`)

**FAIL Criteria:**
- ❌ Tables missing
- ❌ Schema errors
- ❌ Permission errors

---

### G3-STORAGE: MinIO Bucket Exists

```bash
# Test command (requires mc installed):
mc ls local/umca-artifacts

# Expected output:
# (empty bucket - no errors)
```

**PASS Criteria:**
- ✅ Bucket `umca-artifacts` exists
- ✅ Can write to bucket: `echo "test" | mc pipe local/umca-artifacts/test.txt`
- ✅ Can read from bucket: `mc cat local/umca-artifacts/test.txt`

**FAIL Criteria:**
- ❌ Bucket doesn't exist
- ❌ Cannot write/read
- ❌ Permission errors

---

### G4-OBSERVABILITY: Grafana + Tempo Reachable

```bash
# Test Grafana:
curl -s http://localhost:3001/api/health | jq .

# Expected: {"database":"ok", ...}

# Test Tempo:
curl -s http://localhost:3200/ready

# Expected: "ready"
```

**PASS Criteria:**
- ✅ Grafana returns 200, database="ok"
- ✅ Tempo returns "ready"
- ✅ OTLP endpoint accepting connections: `nc -zv localhost 4317`

**FAIL Criteria:**
- ❌ HTTP errors (4xx, 5xx)
- ❌ Services unreachable
- ❌ Connection refused

---

### G5-CONFIG: Environment Variables Set

```bash
# Test command:
grep -q "sk-" .env && echo "PASS: OpenAI key set" || echo "FAIL: Missing OpenAI key"

# Expected:
PASS: OpenAI key set
```

**PASS Criteria:**
- ✅ `.env` file exists
- ✅ `OPENAI_API_KEY` starts with `sk-`
- ✅ `DATABASE_URL` points to localhost:5432
- ✅ `MINIO_ENDPOINT` points to localhost:9000

**FAIL Criteria:**
- ❌ `.env` missing
- ❌ Required keys missing/invalid
- ❌ Wrong endpoints

---

### G6-EVIDENCE: Validation Evidence Stored

```bash
# Test command:
ls -la .automation/evidence/week1/

# Expected:
infrastructure_health.json
database_schema.txt
minio_test.txt
observability_check.json
env_validation.txt
```

**PASS Criteria:**
- ✅ All 5 evidence files exist
- ✅ Files contain actual output (not empty)
- ✅ Evidence stored in `.automation/evidence/week1/`

**FAIL Criteria:**
- ❌ Evidence directory doesn't exist
- ❌ Any evidence file missing
- ❌ Files empty or contain errors

---

## 🛠️ Required Tools & Tech Stack (LOCKED)

### MUST Use:
- ✅ **Docker Compose** (infrastructure orchestration)
- ✅ **Postgres 16+** (state storage)
- ✅ **Redis 7+** (message bus)
- ✅ **MinIO latest** (artifact storage)
- ✅ **Tempo latest** (trace storage)
- ✅ **Grafana latest** (visualization)

### FORBIDDEN:
- ❌ SQLite (not production-grade)
- ❌ In-memory storage (not persistent)
- ❌ Filesystem-based artifact storage (use MinIO)
- ❌ Custom observability (use OpenTelemetry)

---

## 📐 Architecture Constraints (LOCKED)

### Required Services (5 containers):

1. **Postgres** - LangGraph checkpointer + execution tracking
   - Port: 5432
   - Database: `umca`
   - User: `umca`
   - Healthcheck: `pg_isready`

2. **Redis** - Message bus (agent coordination)
   - Port: 6379
   - Healthcheck: `redis-cli ping`

3. **MinIO** - S3-compatible artifact storage
   - API Port: 9000
   - Console Port: 9001
   - Bucket: `umca-artifacts`
   - Healthcheck: `/minio/health/live`

4. **Tempo** - Trace storage
   - OTLP gRPC Port: 4317
   - OTLP HTTP Port: 4318
   - Query Port: 3200

5. **Grafana** - Visualization
   - Port: 3001
   - Default creds: admin/admin123

### Database Schema (LOCKED):

**checkpoints table** (LangGraph requirement):
```sql
CREATE TABLE checkpoints (
  thread_id TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  checkpoint_id TEXT NOT NULL,
  parent_checkpoint_id TEXT,
  checkpoint JSONB NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
);
```

**executions table** (UI tracking):
```sql
CREATE TABLE executions (
  id TEXT PRIMARY KEY,
  user_intent TEXT NOT NULL,
  status TEXT NOT NULL, -- 'planning', 'implementing', etc.
  current_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);
```

---

## 🚫 Forbidden Patterns

### You MUST NOT:
- ❌ Skip healthchecks ("it works on my machine")
- ❌ Use hardcoded passwords in code (only in docker-compose for local dev)
- ❌ Store secrets in git (use .env, gitignored)
- ❌ Skip evidence collection (all tests must save outputs)
- ❌ Proceed to Week 2 if any gate fails

### You MUST:
- ✅ Run verification commands after each step
- ✅ Save all outputs to `.automation/evidence/week1/`
- ✅ Iterate until all gates PASS
- ✅ Report blockers immediately (max 3 iterations)

---

## 🔄 Iteration Protocol

### If Validation Fails:

1. **Diagnose:** Read error logs (`docker logs umca-<service>`)
2. **Fix:** Adjust configuration (docker-compose.yml, init.sql, etc.)
3. **Retry:** Re-run validation command
4. **Evidence:** Save error + fix to `.automation/evidence/week1/iterations/`

**Max 3 iterations per issue.**

**After 3 failed attempts:**
```
🚨 ESCALATION: Week 1, Gate X

Issue: [service] healthcheck failing
Tried: [fix 1, fix 2, fix 3]
Error: [last error message]
Logs: .automation/evidence/week1/iterations/attempt3_logs.txt

Proposed: [your suggestion or "need guidance"]
```

---

## 📊 Evidence Collection Commands

**Run these commands and save outputs:**

```bash
# Create evidence directory
mkdir -p .automation/evidence/week1

# G1: Infrastructure health
docker ps --filter "name=umca-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" \
  > .automation/evidence/week1/infrastructure_health.txt

# G2: Database schema
docker exec umca-postgres psql -U umca -d umca -c "\dt" \
  > .automation/evidence/week1/database_schema.txt
docker exec umca-postgres psql -U umca -d umca -c "\d checkpoints" \
  >> .automation/evidence/week1/database_schema.txt

# G3: MinIO test
echo "test-content-$(date +%s)" | mc pipe local/umca-artifacts/healthcheck.txt
mc cat local/umca-artifacts/healthcheck.txt \
  > .automation/evidence/week1/minio_test.txt

# G4: Observability
curl -s http://localhost:3001/api/health | jq . \
  > .automation/evidence/week1/observability_check.json
curl -s http://localhost:3200/ready \
  >> .automation/evidence/week1/observability_check.json

# G5: Environment validation
{ echo "=== Environment Variables ===";
  echo "OPENAI_API_KEY: $(grep OPENAI_API_KEY .env | cut -d= -f2 | cut -c1-7)...";
  echo "DATABASE_URL: $(grep DATABASE_URL .env | cut -d= -f2)";
  echo "MINIO_ENDPOINT: $(grep MINIO_ENDPOINT .env | cut -d= -f2)";
} > .automation/evidence/week1/env_validation.txt

# G6: Evidence summary
cat > .automation/evidence/week1/WEEK1_SUMMARY.md <<EOF
# Week 1 Evidence Summary

## Gate Results:
- G1-INFRA: $(docker ps --filter "name=umca-" --filter "status=running" | wc -l | grep -q 5 && echo "PASS" || echo "FAIL")
- G2-DB: $(docker exec umca-postgres psql -U umca -d umca -c "\dt" 2>/dev/null | grep -q checkpoints && echo "PASS" || echo "FAIL")
- G3-STORAGE: $(mc ls local/umca-artifacts >/dev/null 2>&1 && echo "PASS" || echo "FAIL")
- G4-OBSERVABILITY: $(curl -s http://localhost:3001/api/health | grep -q ok && echo "PASS" || echo "FAIL")
- G5-CONFIG: $(grep -q "sk-" .env && echo "PASS" || echo "FAIL")
- G6-EVIDENCE: PASS (this file exists)

## Artifacts:
- infrastructure_health.txt
- database_schema.txt
- minio_test.txt
- observability_check.json
- env_validation.txt

## Timestamp: $(date -Iseconds)
EOF
```

---

## 🎓 Reference Documents (READ BEFORE STARTING)

### MUST READ:
1. **CONSTITUTION.md** - Article I (Enterprise from Line 1), Article V (Evidence Requirement)
2. **AGENTS.md** - Rules 1-12 (Evidence-based work, iteration protocol)
3. **ARCHITECTURE_DECISION.md** - Why Smart MCA (understand the system you're building)

### HELPFUL:
4. **VERTICAL_1_TOOLING.md** - Full stack details (OpenAI, LangGraph, E2B)
5. **VERTICAL_1_PLAN.md** - Week 2-8 roadmap (what comes after this)

---

## ✅ Week 1 Complete Checklist

**Before proceeding to Week 2, ALL must be checked:**

- [ ] G1-INFRA: 5 containers running, all healthy
- [ ] G2-DB: checkpoints + executions tables exist
- [ ] G3-STORAGE: MinIO bucket created, read/write works
- [ ] G4-OBSERVABILITY: Grafana + Tempo reachable
- [ ] G5-CONFIG: .env file with valid API keys
- [ ] G6-EVIDENCE: All evidence files in `.automation/evidence/week1/`
- [ ] WEEK1_SUMMARY.md shows all gates PASS

**If ANY item unchecked:** DO NOT proceed. Fix until green.

---

## 🚀 How to Execute

### Step 1: Read Constitutional Requirements
```bash
# Verify you understand the rules
cat CONSTITUTION.md | grep -A5 "Article I"
cat AGENTS.md | grep -A10 "Critical Rules"
```

### Step 2: Create Project Structure
```bash
mkdir -p autonomous-platform
cd autonomous-platform
mkdir -p infrastructure/{postgres,grafana/dashboards,tempo}
mkdir -p .automation/evidence/week1
```

### Step 3: Create Infrastructure Files

**You have wiggle room on:**
- ✅ Exact Docker image tags (postgres:16 vs postgres:16-alpine)
- ✅ Port numbers (if 5432 conflicts, use 5433)
- ✅ Container names (umca-postgres vs autonomous-postgres)
- ✅ Volume names (postgres-data vs umca-pg-data)

**You CANNOT change:**
- ❌ Which services to run (must be 5: postgres, redis, minio, tempo, grafana)
- ❌ Database schema (checkpoints + executions tables required)
- ❌ MinIO bucket name (umca-artifacts)
- ❌ Skip healthchecks

**Create:**
- `infrastructure/docker-compose.yml` (5 services as specified)
- `infrastructure/postgres/init.sql` (schema from above)
- `infrastructure/tempo/tempo.yaml` (OTLP receivers config)
- `.env` (copy from .env.example template)

### Step 4: Start Infrastructure
```bash
docker-compose -f infrastructure/docker-compose.yml up -d
```

### Step 5: Wait for Healthchecks
```bash
# Wait up to 60s for all healthchecks to pass
timeout 60 bash -c 'until docker ps | grep -q "umca-postgres.*healthy"; do sleep 2; done'
timeout 60 bash -c 'until docker ps | grep -q "umca-redis.*healthy"; do sleep 2; done'
timeout 60 bash -c 'until docker ps | grep -q "umca-minio.*healthy"; do sleep 2; done'
```

### Step 6: Initialize MinIO Bucket
```bash
# Install mc if needed, then:
mc alias set local http://localhost:9000 minioadmin minioadmin123
mc mb local/umca-artifacts --ignore-existing
mc anonymous set download local/umca-artifacts
```

### Step 7: Run Validation & Collect Evidence
```bash
# Run all evidence collection commands (from section above)
bash -x .automation/evidence/week1/collect_evidence.sh
```

### Step 8: Verify All Gates PASS
```bash
cat .automation/evidence/week1/WEEK1_SUMMARY.md
# All gates should show PASS
```

---

## 🎯 Success Metrics

**Week 1 is COMPLETE when:**
- ✅ `WEEK1_SUMMARY.md` shows 6/6 gates PASS
- ✅ Can POST to future Gateway (Week 2) and it stores in Postgres
- ✅ Can publish to Redis and subscribe from another terminal
- ✅ Can upload/download files from MinIO
- ✅ Can see traces in Grafana (after Week 2 sends some)

**Week 1 is NOT complete if:**
- ❌ Any gate shows FAIL
- ❌ Services restart frequently
- ❌ Evidence files missing/empty
- ❌ Cannot connect to any service

---

## 💰 Week 1 Costs

**Infrastructure setup:**
- LLM calls: $0 (no AI calls in Week 1)
- Docker: Free (runs locally)
- Time: 2-4 hours

---

## 🆘 When to Escalate

**Escalate immediately if:**
1. Docker won't start (after 3 debugging attempts)
2. Postgres healthcheck fails (after 3 config changes)
3. MinIO bucket creation fails (after checking permissions)
4. Any gate fails after 3 iterations
5. Uncertainty about "how to implement X" (ask for examples, not solutions)

**Do NOT escalate for:**
- Port conflicts (change ports in docker-compose.yml)
- Image download errors (retry or use different mirror)
- Typos in commands (fix and retry)

---

**Ready to start Week 1?**

**First command:**
```bash
mkdir -p autonomous-platform && cd autonomous-platform
cat > infrastructure/docker-compose.yml
# (paste your docker-compose.yml)
```

**After Week 1 PASSES:** Proceed to WEEK_2_DOD.md
