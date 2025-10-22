# Autonomous AI Coding Platform

[![CI](https://github.com/Baragji/autonomous-platform-fresh-start/actions/workflows/ci.yml/badge.svg)](https://github.com/Baragji/autonomous-platform-fresh-start/actions/workflows/ci.yml)

**A fully autonomous, multi-agent AI coding system with Replit/Copilot-class experience, built from day 1 for production.**

**Status:** 🏗️ Week 1 - Infrastructure Setup
**Phase:** Vertical Slice #1 (Smart MCA + 5 Agents)
**Stack:** OpenAI-only, TypeScript, LangGraph, E2B, MinIO, Postgres

---

## 🚨 START HERE (First-Time Contributors)

**Read these files IN ORDER before contributing:**

1. **[CONSTITUTION.md](CONSTITUTION.md)** - Supreme law (immutable principles)
2. **[AGENTS.md](AGENTS.md)** - Universal workflow for ALL AI builders
3. **[docs/11_211025/WEEK_1_DOD.md](docs/11_211025/WEEK_1_DOD.md)** - Current week's outcomes
4. **[docs/11_211025/ARCHITECTURE_DECISION.md](docs/11_211025/ARCHITECTURE_DECISION.md)** - Why Smart MCA architecture

**Don't start work without reading items 1-2.**

---

## 🎯 What We're Building

An autonomous AI coding system that:
- Accepts user request: *"Build a TODO API with tests"*
- Generates working code **autonomously** (90% tasks without human intervention)
- Runs tests + fixes failures automatically (up to 3 repair attempts)
- Returns production-ready code with full evidence (tests, coverage, SBOM, traces)

**User experience:** Like Replit Agent or GitHub Copilot, but fully autonomous.

---

## 🏗️ Architecture (Vertical Slice #1)

```
User Request
    ↓
Gateway (Express API)
    ↓
MCA (Smart LangGraph Supervisor)
    ↓ routes to →
┌─────────────┬──────────────┬─────────┬──────────────┐
│  Planner    │ Implementer  │ Runner  │  Validator   │
│  (OpenAI)   │  (OpenAI)    │ (E2B)   │   (OpenAI)   │
│             │              │         │              │
│ Decompose   │ Generate     │ Execute │ Independently│
│ into tasks  │ code via     │ tests   │ verify all   │
│             │ Function     │ in VM   │ claims       │
│             │ Calling      │         │              │
└─────────────┴──────────────┴─────────┴──────────────┘
    ↓              ↓              ↓              ↓
┌────────────────────────────────────────────────────┐
│          MinIO (Artifacts Storage)                 │
│  - plan.json, code files, junit.xml, coverage.json │
│  - validator-junit.xml, sbom.json, trace-id.txt    │
└────────────────────────────────────────────────────┘
```

### Services (5 Microservices in Vertical #1):

| Service | Tech Stack | Purpose |
|---------|------------|---------|
| **Gateway** | TypeScript + Express | REST API entry point |
| **MCA** | TypeScript + LangGraph + Postgres | Smart coordinator (routes, retries, escalates) |
| **Planner** | TypeScript + OpenAI Structured Outputs | Task decomposition |
| **Implementer** | TypeScript + OpenAI Function Calling | Code generation |
| **Runner** | TypeScript + E2B Sandbox | Test execution in VM |
| **Validator** | TypeScript + OpenAI Structured Outputs | Zero-trust verification |

**Infrastructure:**
- Postgres (LangGraph checkpointer + execution tracking)
- Redis Streams (message bus, migrate to NATS at scale)
- MinIO (S3-compatible artifact storage)
- OpenTelemetry + Tempo + Grafana (distributed tracing)
- Langfuse (LLM cost tracking)

---

## 🛠️ Technology Stack (LOCKED)

### Approved (ONLY use these):
- ✅ **Languages:** TypeScript/JavaScript (Node.js 20+)
- ✅ **LLM:** OpenAI ONLY (GPT-4o, GPT-5)
- ✅ **Orchestration:** LangGraph JS + Postgres Checkpointer
- ✅ **Code Generation:** OpenAI Function Calling (custom `edit_file` tool)
- ✅ **Sandbox:** E2B Sandbox → Firecracker migration path
- ✅ **Storage:** MinIO (S3-compatible)
- ✅ **Database:** Postgres 16+
- ✅ **Message Bus:** Redis Streams → NATS JetStream migration path
- ✅ **Observability:** OpenTelemetry + Tempo + Grafana + Langfuse

### Forbidden:
- ❌ Anthropic Claude (we use OpenAI-only in V1)
- ❌ SQLite (not production-grade)
- ❌ In-memory storage (not persistent)
- ❌ Monolithic architecture
- ❌ Custom implementations of battle-tested tools

**Why OpenAI-only?** See [ARCHITECTURE_DECISION.md](docs/11_211025/ARCHITECTURE_DECISION.md) and user has OpenAI credits.

---

## 🚀 Quick Start (Week 1)

### Prerequisites:
- Node.js 20+
- Docker + Docker Compose
- OpenAI API key
- E2B API key (optional for Week 1)

### Week 1 Goal: Infrastructure Setup

**Outcome:** Get Postgres, Redis, MinIO, Grafana running locally and validated.

**Follow this DoD:**
```bash
cat docs/11_211025/WEEK_1_DOD.md
```

**Steps:**
1. Read AGENTS.md (universal rules)
2. Read WEEK_1_DOD.md (this week's outcomes)
3. Execute Week 1 tasks (infrastructure setup)
4. Verify all 6 gates PASS
5. Save evidence to `.automation/evidence/week1/`

**Success criteria:**
- ✅ 5 Docker containers running (postgres, redis, minio, tempo, grafana)
- ✅ Database schema created (checkpoints + executions tables)
- ✅ MinIO bucket operational (read/write test passes)
- ✅ Grafana + Tempo reachable
- ✅ Environment variables configured
- ✅ All evidence files present

---

## 📚 Documentation

### Constitutional Framework:
- **[CONSTITUTION.md](CONSTITUTION.md)** - Immutable principles (enterprise from line 1, no refactoring, evidence-driven)
- **[AGENTS.md](AGENTS.md)** - Universal workflow for AI builders (iteration protocol, tech stack, gates)

### Architecture & Design:
- **[docs/11_211025/ARCHITECTURE_DECISION.md](docs/11_211025/ARCHITECTURE_DECISION.md)** - Why Smart MCA + Smart Specialists + Zero-Trust Validator
- **[docs/11_211025/VERTICAL_1_TOOLING.md](docs/11_211025/VERTICAL_1_TOOLING.md)** - Production tool stack (OpenAI, LangGraph, E2B, etc.)
- **[docs/11_211025/VERTICAL_1_PLAN.md](docs/11_211025/VERTICAL_1_PLAN.md)** - 8-week implementation roadmap

### Execution (Current Week):
- **[docs/11_211025/WEEK_1_DOD.md](docs/11_211025/WEEK_1_DOD.md)** - Week 1 Definition of Done (infrastructure setup)

### Research:
- **[docs/11_211025/umca_RA_part2.md](docs/11_211025/umca_RA_part2.md)** - RA research on OpenAI vs Anthropic for code generation
- **[docs/11_211025/umca_research_report_multi_agent_ai_coding_system_oct_2025.md](docs/11_211025/umca_research_report_multi_agent_ai_coding_system_oct_2025.md)** - Original RA research

---

## 🔒 Governance (Constitutional Principles)

This repository is governed by **[CONSTITUTION.md](CONSTITUTION.md)**.

### Key Principles:

1. **Enterprise from Line 1**
   - ✅ Build production architecture NOW (no prototypes)
   - ❌ NO "build monolith, refactor later"
   - ❌ NO "use custom code, replace with library later"

2. **Battle-Tested Tools Only**
   - ✅ Use LangGraph, OpenAI SDK, E2B, MinIO (proven tools)
   - ❌ NO custom LLM orchestration, HTTP clients, retry logic

3. **Microservices from Day 1**
   - ✅ Independent services in monorepo (`packages/gateway`, `packages/mca`, etc.)
   - ❌ NO monolithic `src/` directory

4. **Evidence-Driven**
   - ✅ Every task produces evidence (.automation/evidence/$TASK/)
   - ✅ SBOM, test results, coverage, traces, provenance
   - ❌ NO claims without machine-verifiable artifacts

5. **Binary Gates (PASS/FAIL)**
   - ✅ Lint → TypeCheck → Test (≥80% coverage) → Acceptance
   - ❌ NO subjective "looks good" or "seems fine"

6. **Iteration to Green**
   - ✅ If validation fails: diagnose → fix → retry (max 3x) → escalate
   - ✅ SUCCESS = all gates PASS (green), NOT "followed protocol"

### Banned Patterns:
- ❌ Path guessing without discovery (`grep`/`find` first)
- ❌ Hardcoded success (`return {success: true}` without real validation)
- ❌ TypeScript `any` (type properly)
- ❌ TODO/FIXME in src/ (complete work before PR)
- ❌ Console.log in src/ (use proper logger)

---

## 🎯 Success Metrics

**Vertical Slice #1 targets:**

| Metric | Target | How Measured |
|--------|--------|--------------|
| **Autonomy** | ≥90% | `completed_tasks / (completed + escalated)` |
| **Cost** | <$2/execution | Langfuse cost reports per trace |
| **Quality** | 0 critical findings, ≥80% coverage | SARIF, coverage.json, junit.xml |
| **Iteration** | <2 iterations/task average | Count of `.automation/evidence/$TASK/iterations/` |
| **Evidence** | 100% complete | CI checks for summary.md, valid/, artifacts.sha256 |

---

## 🔄 Workflow (AI Builders)

**Every task follows this flow:**

```
1. Read CONSTITUTION.md + AGENTS.md (if first time)
   ↓
2. Read task DoD (e.g., WEEK_1_DOD.md)
   ↓
3. Discover targets (grep/find, save discovery.txt)
   ↓
4. Implement change (within architectural boundaries)
   ↓
5. Run validation gates (lint → typecheck → test)
   ↓
6. If FAIL: Iterate (diagnose → fix → retry, max 3x)
   ↓
7. If PASS: Save evidence (.automation/evidence/$TASK/)
   ↓
8. Upload artifacts to MinIO
   ↓
9. Mark complete (if green) OR escalate (if 3 iterations failed)
```

**Detailed workflow:** See [AGENTS.md](AGENTS.md)

---

## 📊 Project Status

**Current Phase:** Vertical Slice #1 (Weeks 1-8)

**Week-by-week plan:**
- **Week 1-2:** Infrastructure + Gateway + MCA + Planner
- **Week 3-4:** Implementer + VFS + Streaming
- **Week 5-6:** Runner + E2B + Test Execution
- **Week 7-8:** Validator + Remediation Loops + End-to-End

**Full roadmap:** [docs/11_211025/VERTICAL_1_PLAN.md](docs/11_211025/VERTICAL_1_PLAN.md)

---

## 🆘 Getting Help

**If stuck:**
1. **Read [AGENTS.md](AGENTS.md)** - Universal workflow rules
2. **Check task DoD** - Clear acceptance criteria (e.g., WEEK_1_DOD.md)
3. **Search codebase** - Use `grep`/`find` for context
4. **Escalate** - After 3 failed iteration attempts, escalate with evidence

**Escalation format:** See [AGENTS.md](AGENTS.md) section "Error Handling"

---

## 🏛️ Philosophy

**"Enterprise from Line 1. Always."**

- Every line of code is production-grade
- Every decision is evidence-backed
- Every gate is binary (PASS/FAIL)
- Every service is isolated (microservices)
- Every iteration brings you closer to PASS (not just "tried")
- Every escalation includes 3 attempts + evidence

**Iteration to green is autonomy. Reporting errors is not.**

---

## 📝 License

Proprietary. All rights reserved.

**Owner:** @yousefbaragji

---

## 🔗 Quick Links

- **Governance:** [CONSTITUTION.md](CONSTITUTION.md) | [AGENTS.md](AGENTS.md)
- **Architecture:** [ARCHITECTURE_DECISION.md](docs/11_211025/ARCHITECTURE_DECISION.md) | [VERTICAL_1_TOOLING.md](docs/11_211025/VERTICAL_1_TOOLING.md)
- **Execution:** [WEEK_1_DOD.md](docs/11_211025/WEEK_1_DOD.md) | [VERTICAL_1_PLAN.md](docs/11_211025/VERTICAL_1_PLAN.md)
- **Research:** [umca_RA_part2.md](docs/11_211025/umca_RA_part2.md)

---

**Ready to start?** Begin with [WEEK_1_DOD.md](docs/11_211025/WEEK_1_DOD.md)
