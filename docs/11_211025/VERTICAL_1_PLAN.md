# Vertical Slice #1: Implementation Plan

**Date:** 2025-10-21  
**Status:** READY TO BUILD  
**Duration:** 8 weeks  
**Team:** AI Development Agents + Claude (oversight)

---

## Executive Summary

This document provides the step-by-step implementation plan for **Vertical Slice #1**, the first complete end-to-end function of the autonomous coding system.

**Goal:** Deliver a production-grade pipeline where a user can say "Build a TODO API with tests" and receive working, tested code with zero human intervention (except on escalation).

**Success Criteria:**
- ✅ Complete execution without human intervention
- ✅ Validator catches mistakes Implementer makes
- ✅ MCA adapts to context-specific requirements
- ✅ Cost per execution ≤ $2
- ✅ All artifacts stored in MinIO with traces in Grafana

---

## Scope: What We're Building

### In Scope (Vertical #1):

```
User → Gateway → MCA → Planner → Implementer → Runner → Validator → Result
```

**Agents:**
1. **MCA** (Smart Coordinator) - Routes messages, coordinates agents, handles escalation
2. **Planner** (Smart Specialist) - Decomposes user intent into 2-10 tasks
3. **Implementer** (Smart Specialist) - Generates code using Anthropic Text Editor Tool
4. **Runner** (Tool Executor) - Runs tests in E2B sandbox, captures JUnit/coverage
5. **Validator** (Smart Specialist) - Zero-trust verification, proposes remediations

**Infrastructure:**
- LangGraph JS + Postgres (state/checkpointing)
- Redis Streams (message bus)
- MinIO (artifact storage)
- OpenTelemetry → Tempo → Grafana (observability)
- Langfuse (LLM cost tracking)

**Deliverables:**
- User can POST /executions with natural language intent
- System returns 202 Accepted with Location header
- Artifacts available: plan.json, code files, junit.xml, coverage.json, validation report
- Traces visible in Grafana
- Remediation loop works (Validator → MCA → Implementer)
- Escalation works (3x failures → human notification)

### Out of Scope (Later Verticals):

- ❌ Security Agent (Semgrep, Trivy, SBOM)
- ❌ Quality Agent (beyond coverage %)
- ❌ Architect Agent (ADRs, OpenAPI)
- ❌ Research Agent (library evaluation)
- ❌ DBA Agent (schema design)
- ❌ Frontend UI (Next.js + Monaco)
- ❌ Multi-tenant isolation
- ❌ Authentication/authorization
- ❌ Firecracker migration (using E2B initially)

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│                    Gateway API                      │
│           POST /executions                          │
│           GET /executions/:id                       │
│           GET /executions/:id/stream (SSE)          │
└─────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────┐
│            MCA (LangGraph Supervisor)               │
│  • Routes to agents via Redis Streams               │
│  • Maintains state in Postgres checkpointer         │
│  • Handles escalation (3x failures → human)         │
└─────────────────────────────────────────────────────┘
         ↓              ↓              ↓              ↓
┌─────────────┐ ┌──────────────┐ ┌─────────┐ ┌──────────────┐
│   Planner   │ │ Implementer  │ │ Runner  │ │  Validator   │
│  (OpenAI)   │ │ (OpenAI)     │ │ (E2B)   │ │   (OpenAI)   │
│             │ │              │ │         │ │              │
│ • Decompose │ │ • Text Editor│ │ • npm   │ │ • Re-run     │
│   into tasks│ │   Tool       │ │   test  │ │   tests      │
│ • Validate  │ │ • Stream     │ │ • JUnit │ │ • Check      │
│   DAG       │ │   edits      │ │ • Coverage│ │   secrets  │
└─────────────┘ └──────────────┘ └─────────┘ └──────────────┘
         ↓              ↓              ↓              ↓
┌─────────────────────────────────────────────────────┐
│                  MinIO (Artifacts)                  │
│  • plan.json                                        │
│  • code files (src/app.ts, src/app.test.ts)        │
│  • junit.xml                                        │
│  • coverage.json                                    │
│  • validation-report.json                           │
└─────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────┐
│          OpenTelemetry → Tempo → Grafana            │
│  • Trace every execution end-to-end                 │
│  • Span per agent                                   │
│  • Link to MinIO artifacts                          │
└─────────────────────────────────────────────────────┘
```

---

## Week-by-Week Build Schedule

### Week 1-2: Foundation + MCA + Planner

**Goal:** POST /executions → Planner returns valid plan JSON

#### Tasks:

1. **Infrastructure Setup** (3 days)
   - [ ] Set up Postgres with LangGraph checkpointer schema
   - [ ] Set up Redis for message bus
   - [ ] Set up MinIO with `umca-artifacts` bucket
   - [ ] Set up OpenTelemetry collector + Tempo + Grafana
   - [ ] Configure Langfuse for LLM cost tracking
   - [ ] Write docker-compose.yml for local development
   - [ ] Test connectivity between all services

2. **Gateway API** (2 days)
   - [ ] Create Express.js server with TypeScript
   - [ ] Implement POST /executions endpoint
   - [ ] Implement GET /executions/:id endpoint
   - [ ] Implement GET /executions/:id/stream (SSE) endpoint
   - [ ] Add RFC 9457 Problem Details error handling
   - [ ] Add OpenTelemetry instrumentation
   - [ ] Write integration tests

3. **MCA (Smart Coordinator)** (3 days)
   - [ ] Install LangGraph JS + Postgres checkpointer
   - [ ] Define State type with TypeScript
   - [ ] Implement Supervisor node (LLM-powered routing)
   - [ ] Add conditional edges to agents
   - [ ] Add escalation logic (3x failures → human)
   - [ ] Wire to Postgres checkpointer
   - [ ] Add OpenTelemetry spans per node
   - [ ] Write unit tests for routing logic

4. **Planner Agent** (2 days)
   - [ ] Install OpenAI SDK + Zod
   - [ ] Define PlanSchema with Zod
   - [ ] Implement plannerAgent function with Structured Outputs
   - [ ] Add topological sort for task dependencies
   - [ ] Store plan.json in MinIO
   - [ ] Add retry logic (3x) for schema violations
   - [ ] Add Langfuse tracing
   - [ ] Write unit tests with mock OpenAI responses

**Acceptance Criteria (Week 2):**
- [ ] POST /executions with "Build TODO API" returns 202 Accepted
- [ ] plan.json stored in MinIO with valid schema
- [ ] Trace visible in Grafana showing Gateway → MCA → Planner
- [ ] Langfuse shows token usage and cost
- [ ] Resume works (restart service mid-execution, continues from checkpoint)

---

### Week 3-4: Implementer + VFS

**Goal:** Planner output → Implementer → code artifacts in MinIO

#### Tasks:

1. **Virtual File System** (2 days)
   - [ ] Design VFS interface (read, write, list, delete)
   - [ ] Implement in-memory VFS (Map-based) for prototype
   - [ ] Implement MinIO-backed VFS for persistence
   - [ ] Add versioning support (shadow copies)
   - [ ] Add rollback mechanism
   - [ ] Write unit tests

2. **Implementer Agent** (4 days)
   - [ ] Install OpenAI SDK
   - [ ] Implement implementerAgent with OpenAI Function Calling
   - [ ] Handle tool calls: view, create, str_replace, insert
   - [ ] Execute edits against VFS
   - [ ] Store all edits in MinIO (audit trail)
   - [ ] Add syntax validation (TypeScript compiler API)
   - [ ] Add Langfuse tracing
   - [ ] Write unit tests with mock OpenAI responses

3. **SSE Streaming** (2 days)
   - [ ] Publish edit events to Redis Stream
   - [ ] Subscribe in Gateway SSE endpoint
   - [ ] Stream tool_call_delta events for live UI updates
   - [ ] Stream edit.complete events with diffs
   - [ ] Add client-side reconnection logic
   - [ ] Test with curl/Postman

4. **MCA Integration** (2 days)
   - [ ] Wire MCA → Planner → Implementer flow
   - [ ] Add state transitions (planning → implementing)
   - [ ] Add error handling (Implementer fails → MCA escalates)
   - [ ] Test end-to-end

**Acceptance Criteria (Week 4):**
- [ ] Planner output → Implementer generates TypeScript code
- [ ] Code files stored in MinIO (src/app.ts, src/app.test.ts)
- [ ] SSE stream shows live edits as they're generated
- [ ] Trace shows Planner → Implementer link
- [ ] Syntax-invalid code rejected before storage
- [ ] Rollback works (can restore previous version)

---

### Week 5-6: Runner + E2B

**Goal:** Implementer output → Runner → JUnit/coverage in MinIO

#### Tasks:

1. **E2B Sandbox Setup** (1 day)
   - [ ] Create E2B account
   - [ ] Install E2B SDK
   - [ ] Test basic sandbox creation/destruction
   - [ ] Configure Node.js 20 template

2. **Runner Agent** (4 days)
   - [ ] Implement runnerAgent with E2B Sandbox
   - [ ] Write files to sandbox from VFS
   - [ ] Run `npm install` with timeout
   - [ ] Run `npm test -- --reporter=json --coverage`
   - [ ] Parse JUnit XML from stdout
   - [ ] Parse coverage.json from sandbox filesystem
   - [ ] Store artifacts in MinIO
   - [ ] Add resource limits (CPU, memory, time)
   - [ ] Add network isolation (disable by default)
   - [ ] Add Langfuse tracing
   - [ ] Write integration tests

3. **MCA Integration** (2 days)
   - [ ] Wire MCA → Implementer → Runner flow
   - [ ] Handle Runner failures (timeout, OOM, test failures)
   - [ ] Add state transitions (implementing → running)
   - [ ] Test end-to-end

4. **Error Handling** (1 day)
   - [ ] Circuit breaker for E2B rate limits
   - [ ] Exponential backoff for transient failures
   - [ ] Capture detailed error logs
   - [ ] Add Problem Details responses

**Acceptance Criteria (Week 6):**
- [ ] Implementer output → Runner executes tests in E2B
- [ ] JUnit XML and coverage.json stored in MinIO
- [ ] Tests pass: Runner returns exit code 0
- [ ] Tests fail: Runner captures failure details
- [ ] Trace shows Implementer → Runner link
- [ ] E2B sandbox cleaned up after execution
- [ ] Network isolation verified (cannot curl external APIs)

---

### Week 7-8: Validator + End-to-End

**Goal:** Full flow with zero-trust validation and remediation loops

#### Tasks:

1. **Validator Agent** (4 days)
   - [ ] Implement validatorAgent with zero-trust logic
   - [ ] Read task from MCA
   - [ ] Read Implementer report (don't trust it)
   - [ ] Independently run tests (ground truth)
   - [ ] Scan for hardcoded secrets (regex patterns)
   - [ ] Verify coverage ≥ 80%
   - [ ] Call LLM judge only if failures (Structured Outputs)
   - [ ] Store validation report in MinIO
   - [ ] Add Langfuse tracing
   - [ ] Write unit tests

2. **Remediation Loop** (2 days)
   - [ ] Validator FAIL → publish to Redis Stream
   - [ ] MCA receives failure → routes back to Implementer
   - [ ] Implementer receives remediation contract
   - [ ] Implementer fixes code → re-runs pipeline
   - [ ] Test 3x failure → escalation to human

3. **Human Escalation** (1 day)
   - [ ] Detect 3x consecutive failures
   - [ ] Create escalation notification (email/Slack)
   - [ ] Pause execution until human approves/rejects
   - [ ] Log escalation event

4. **End-to-End Testing** (3 days)
   - [ ] Test happy path: User intent → working code
   - [ ] Test remediation: Intentional bug → Validator catches → Implementer fixes
   - [ ] Test escalation: 3x failures → human notification
   - [ ] Test resume: Restart services mid-execution
   - [ ] Load test: 5 concurrent executions
   - [ ] Verify all artifacts in MinIO
   - [ ] Verify all traces in Grafana
   - [ ] Verify costs in Langfuse

**Acceptance Criteria (Week 8):**
- [ ] Full flow works end-to-end without human intervention
- [ ] Validator catches intentional bugs (e.g., hardcoded password)
- [ ] Remediation loop works (Validator → MCA → Implementer)
- [ ] 3x failures trigger human escalation
- [ ] All artifacts stored in MinIO with correct structure
- [ ] All traces visible in Grafana with linked artifacts
- [ ] Cost per execution < $2 (measured in Langfuse)
- [ ] 95% uptime over 24-hour load test

---

## File Structure

```
autonomous-platform/
├── packages/
│   ├── gateway/                  # Express API (POST /executions)
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── routes/
│   │   │   │   ├── executions.ts
│   │   │   │   └── stream.ts
│   │   │   ├── middleware/
│   │   │   │   ├── errors.ts    # RFC 9457 handler
│   │   │   │   └── otel.ts      # OpenTelemetry
│   │   │   └── types.ts
│   │   └── package.json
│   │
│   ├── mca/                      # LangGraph coordinator
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── graph.ts         # LangGraph state machine
│   │   │   ├── nodes/
│   │   │   │   ├── supervisor.ts
│   │   │   │   └── types.ts
│   │   │   └── checkpointer.ts  # Postgres config
│   │   └── package.json
│   │
│   ├── planner/                  # Task decomposition agent
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── agent.ts         # OpenAI Structured Outputs
│   │   │   ├── schema.ts        # Zod schemas
│   │   │   └── validate.ts      # Topological sort
│   │   └── package.json
│   │
│   ├── implementer/              # Code generation agent
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── agent.ts         # Anthropic Text Editor Tool
│   │   │   ├── vfs.ts           # Virtual file system
│   │   │   └── validation.ts    # Syntax checking
│   │   └── package.json
│   │
│   ├── runner/                   # Test execution agent
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── agent.ts         # E2B integration
│   │   │   ├── parsers/
│   │   │   │   ├── junit.ts
│   │   │   │   └── coverage.ts
│   │   │   └── sandbox.ts
│   │   └── package.json
│   │
│   ├── validator/                # Zero-trust validation agent
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── agent.ts         # LLM judge
│   │   │   ├── checks/
│   │   │   │   ├── tests.ts
│   │   │   │   ├── coverage.ts
│   │   │   │   └── secrets.ts
│   │   │   └── schema.ts        # Validation report schema
│   │   └── package.json
│   │
│   └── shared/                   # Shared utilities
│       ├── src/
│       │   ├── minio.ts         # MinIO client
│       │   ├── redis.ts         # Redis Streams client
│       │   ├── otel.ts          # OpenTelemetry setup
│       │   ├── langfuse.ts      # Langfuse client
│       │   └── types.ts         # Shared types
│       └── package.json
│
├── infrastructure/
│   ├── docker-compose.yml       # Local dev (Postgres, Redis, MinIO, Tempo, Grafana)
│   ├── postgres/
│   │   └── init.sql             # LangGraph checkpointer schema
│   ├── grafana/
│   │   └── dashboards/          # Pre-built dashboards
│   └── tempo/
│       └── tempo.yaml           # Tempo config
│
├── docs/
│   ├── ARCHITECTURE_DECISION.md
│   ├── VERTICAL_1_TOOLING.md
│   └── VERTICAL_1_PLAN.md       # This file
│
└── package.json                  # Root package (Turborepo monorepo)
```

---

## Environment Variables

```bash
# .env.local

# LLM APIs
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Databases
DATABASE_URL=postgresql://umca:password@localhost:5432/umca
REDIS_URL=redis://localhost:6379

# MinIO
MINIO_ENDPOINT=http://localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin123

# E2B
E2B_API_KEY=e2b_...

# Observability
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...

# App
NODE_ENV=development
PORT=3000
```

---

## Testing Strategy

### Unit Tests
- **Each agent** has unit tests with mocked LLM responses
- **VFS** has tests for CRUD operations
- **Validators** (Zod schemas, topological sort) have property-based tests

### Integration Tests
- **Gateway → MCA** flow (POST /executions returns 202)
- **MCA → Planner** flow (task stored in Redis, plan.json in MinIO)
- **Planner → Implementer** flow (code generated)
- **Implementer → Runner** flow (tests executed)
- **Runner → Validator** flow (validation report created)

### End-to-End Tests
- **Happy path:** User intent → working code
- **Remediation:** Bug → Validator catches → Implementer fixes
- **Escalation:** 3x failures → human notification
- **Resume:** Service restart mid-execution continues

### Load Tests
- **5 concurrent executions** for 1 hour
- Measure: p50, p95, p99 latency
- Measure: error rate
- Measure: cost per execution

---

## Monitoring & Alerts

### Grafana Dashboards

1. **Executions Overview**
   - Total executions (last 24h)
   - Success rate (%)
   - Average duration (seconds)
   - Active executions (gauge)

2. **Agent Performance**
   - Planner: avg time, token usage
   - Implementer: avg time, token usage, edits/execution
   - Runner: avg time, sandbox creation time
   - Validator: avg time, token usage, pass rate

3. **Infrastructure Health**
   - Postgres: connection pool usage, query latency
   - Redis: memory usage, stream length
   - MinIO: storage used, request latency
   - E2B: sandbox creation rate, failure rate

4. **Cost Tracking**
   - LLM costs by agent ($/hour)
   - E2B costs ($/hour)
   - Total cost per execution
   - Projected monthly cost

### Alerts

- [ ] Execution failure rate > 10% (5min window)
- [ ] Execution duration > 10 minutes (p95)
- [ ] LLM cost > $5/execution
- [ ] Postgres connection pool exhausted
- [ ] Redis memory > 80%
- [ ] MinIO storage > 80%
- [ ] E2B rate limit hit

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **End-to-end success rate** | ≥ 90% | (successful executions / total) × 100 |
| **Autonomy rate** | ≥ 90% | (executions without human intervention / total) × 100 |
| **Remediation success rate** | ≥ 70% | (failures fixed by Implementer / total failures) × 100 |
| **Average execution time** | < 5 minutes | p50 duration from POST to completion |
| **Cost per execution** | < $2 | Sum of all LLM + E2B costs |
| **Validator precision** | ≥ 95% | (true positives / (true positives + false positives)) × 100 |
| **Validator recall** | ≥ 90% | (true positives / (true positives + false negatives)) × 100 |
| **Infrastructure uptime** | ≥ 95% | % of time all services healthy |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **E2B rate limits** | High | High | Circuit breaker, queue depth monitoring, fall back to Docker |
| **LLM API outages** | Medium | High | Multi-vendor fallback (Anthropic → OpenAI) |
| **Cost overruns** | Medium | Medium | Per-execution budget cap, kill switch at $5/execution |
| **Postgres connection exhaustion** | Low | High | Connection pooling, max 50 connections, monitoring |
| **Redis memory exhaustion** | Low | Medium | Stream TTL, max 10k messages, monitoring |
| **MinIO disk full** | Low | High | Lifecycle policies (30-day retention), monitoring |
| **Validator false positives** | Medium | Medium | Tune LLM judge thresholds, prioritize ground truth tools |
| **Implementer syntax errors** | High | Medium | Syntax validation before storage, remediation loop |
| **Security vulnerabilities in generated code** | Medium | Critical | Add Security Agent in Vertical #2 (out of scope for V1) |

---

## Handoff to AI Development Team

### Prerequisites

Before starting, ensure:
- [ ] All infrastructure is running (docker-compose up)
- [ ] Environment variables are set
- [ ] API keys are valid (Anthropic, OpenAI, E2B)
- [ ] Databases are initialized (Postgres schema, MinIO bucket)

### Build Order

1. **Start with infrastructure** (Week 1)
   - Don't skip this - test everything works before building agents
   - Validate: Can you write to Postgres? Redis? MinIO?

2. **Build Gateway + MCA first** (Week 1-2)
   - Get the skeleton working (POST → MCA → placeholder Planner)
   - Validate: Can you checkpoint state and resume?

3. **Add Planner** (Week 2)
   - Wire to MCA via Redis Streams
   - Validate: POST → MCA → Planner → plan.json in MinIO

4. **Add Implementer** (Week 3-4)
   - Don't skip VFS implementation
   - Validate: Planner → Implementer → code files in MinIO

5. **Add Runner** (Week 5-6)
   - Test E2B thoroughly before integrating
   - Validate: Implementer → Runner → junit.xml in MinIO

6. **Add Validator** (Week 7-8)
   - Implement zero-trust checks first (tests, coverage, secrets)
   - Add LLM judge last (only for tie-breaks)
   - Validate: Full flow with remediation loop

### Constitutional Reminders

- ✅ **No stubs** - Every agent must call real tools (no hardcoded responses)
- ✅ **Production from line 1** - Don't build prototypes, build the real thing
- ✅ **Evidence-based** - All decisions stored as artifacts in MinIO
- ✅ **Vertical slice** - Complete this slice before adding more agents
- ✅ **Zero refactoring debt** - Build it right the first time

### When to Escalate

Escalate to Claude/User if:
- Any tool doesn't work as documented (API change, breaking bug)
- Cost exceeds $2/execution consistently
- Can't achieve 90% autonomy rate
- E2B rate limits block progress
- Architecture decision needed (not covered in docs)

---

## Appendix: Example Execution

### Request:
```bash
curl -X POST http://localhost:3000/api/executions \
  -H "Content-Type: application/json" \
  -d '{
    "intent": "Build a REST API for managing TODO items with CRUD operations. Include unit tests with >80% coverage."
  }'
```

### Response:
```json
{
  "id": "exec-abc123",
  "status": "accepted",
  "location": "/api/executions/exec-abc123",
  "stream": "/api/executions/exec-abc123/stream"
}
```

### SSE Stream Events:
```
event: status
data: {"state": "planning"}

event: agent
data: {"agent": "planner", "status": "working"}

event: artifact
data: {"type": "plan", "url": "http://minio:9000/umca-artifacts/exec-abc123/plan.json"}

event: status
data: {"state": "implementing"}

event: agent
data: {"agent": "implementer", "status": "working"}

event: edit.streaming
data: {"path": "src/todos.ts", "partial": "export interface Todo {"}

event: edit.complete
data: {"path": "src/todos.ts", "diff": "..."}

event: artifact
data: {"type": "code", "url": "http://minio:9000/umca-artifacts/exec-abc123/src/todos.ts"}

event: status
data: {"state": "running"}

event: agent
data: {"agent": "runner", "status": "working"}

event: artifact
data: {"type": "junit", "url": "http://minio:9000/umca-artifacts/exec-abc123/junit.xml"}

event: artifact
data: {"type": "coverage", "url": "http://minio:9000/umca-artifacts/exec-abc123/coverage.json"}

event: status
data: {"state": "validating"}

event: agent
data: {"agent": "validator", "status": "working"}

event: artifact
data: {"type": "validation", "url": "http://minio:9000/umca-artifacts/exec-abc123/validation-report.json"}

event: complete
data: {
  "id": "exec-abc123",
  "status": "completed",
  "verdict": "PASS",
  "artifacts": {
    "plan": "http://minio:9000/umca-artifacts/exec-abc123/plan.json",
    "code": ["http://minio:9000/umca-artifacts/exec-abc123/src/todos.ts", "..."],
    "junit": "http://minio:9000/umca-artifacts/exec-abc123/junit.xml",
    "coverage": "http://minio:9000/umca-artifacts/exec-abc123/coverage.json",
    "validation": "http://minio:9000/umca-artifacts/exec-abc123/validation-report.json"
  },
  "trace_id": "trace-xyz789",
  "cost": 1.23,
  "duration_seconds": 127
}
```

### Grafana Trace:
```
exec-abc123 (127s, $1.23)
├── gateway.receive (0.1s)
├── mca.supervisor (0.5s)
├── planner.execute (12.3s, $0.15)
├── mca.supervisor (0.3s)
├── implementer.execute (45.7s, $0.78)
├── mca.supervisor (0.2s)
├── runner.execute (52.1s, $0.12)
├── mca.supervisor (0.2s)
└── validator.execute (15.6s, $0.18)
```

---

**Ready to build?** Confirm approval and we'll begin Week 1!
