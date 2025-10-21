# Autonomous Platform

**Enterprise-grade autonomous software delivery system with multi-agent orchestration, binary gates, and evidence-driven workflows.**

**Status:** Constitutional Framework Ready
**Next:** Implement Enterprise Skeleton

---

## 🚨 START HERE

**Read these files IN ORDER before doing anything:**

1. **[START_HERE.md](START_HERE.md)** ← Entry point
2. **[CONSTITUTION.md](CONSTITUTION.md)** ← The supreme law
3. **[AI_INSTRUCTIONS.md](AI_INSTRUCTIONS.md)** ← How to work here
4. **[SESSION_HANDOFF.md](SESSION_HANDOFF.md)** ← Context from last session

---

## 🏛️ What This Is

An enterprise-grade autonomous software delivery platform built with:
- ✅ **Enterprise from Line 1** (no prototypes, no refactoring)
- ✅ **10 Microservices** (gateway, orchestrator, 8 agents, UI)
- ✅ **Battle-Tested Tools** (LangGraph, NATS, MinIO, OpenTelemetry)
- ✅ **Contracts First** (OpenAPI 3.1 + JSON Schema)
- ✅ **Evidence Always** (SBOM, SLSA, SARIF, tests, traces)
- ✅ **Binary Gates** (PASS or FAIL, no subjective)

---

## 🚀 Quick Start

### 1. Read the Governance
```bash
cat START_HERE.md        # Entry point
cat CONSTITUTION.md      # The law
cat AI_INSTRUCTIONS.md   # Workflow
cat SESSION_HANDOFF.md   # Last session context
```

### 2. Implement the Skeleton
```bash
# Follow this file EXACTLY
cat docs/11_211025/delivery.md

# It contains:
# - Complete file tree
# - docker-compose.yml
# - OpenAPI specs
# - JSON schemas
# - GitHub Actions
# - LangGraph orchestrator
# - Service templates
```

### 3. Week 1 Goal
Get full end-to-end execution working:
- POST /executions → 202 Accepted
- Orchestrator runs all agents (planner → finops)
- Evidence bundle generated
- Traces visible in Grafana
- Artifacts in MinIO

---

## 📚 Documentation

### Essential Reading
- **[START_HERE.md](START_HERE.md)** - Orientation
- **[CONSTITUTION.md](CONSTITUTION.md)** - Immutable principles
- **[AI_INSTRUCTIONS.md](AI_INSTRUCTIONS.md)** - Workflow guide
- **[SESSION_HANDOFF.md](SESSION_HANDOFF.md)** - Session context

### Implementation
- **[docs/11_211025/delivery.md](docs/11_211025/delivery.md)** - **MAIN REFERENCE** (skeleton)
- **[docs/11_211025/TECH_STACK_CLARIFICATION.md](docs/11_211025/TECH_STACK_CLARIFICATION.md)** - Tech choices
- **[docs/VISION.md](docs/VISION.md)** - Product vision

---

## 🏗️ Architecture (10 Services)

| Service | Tech Stack | Purpose |
|---------|------------|---------|
| Gateway | TypeScript + Fastify | API entry point |
| Orchestrator | TypeScript + LangGraph | Multi-agent workflow |
| Planner (RA) | Python + FastAPI | Research agent |
| Architect (AA) | Python | Architecture agent |
| Implementer (IA) | Python + LangChain | Code generation |
| Runner (DA) | Go + Fiber | Sandboxed execution |
| Security (SA) | Rust + Axum | SAST, SBOM, SARIF |
| Quality (QA) | TypeScript | Coverage enforcement |
| FinOps (FOPS) | TypeScript | Budget tracking |
| UI | Next.js + React | Premium end-user UX |

**Infrastructure:**
- NATS JetStream (messaging)
- MinIO (artifacts)
- Postgres (state)
- OpenTelemetry → Tempo → Grafana (traces)

---

## 🔒 Governance

**This repository is governed by [CONSTITUTION.md](CONSTITUTION.md).**

Key principles:
1. Enterprise from Line 1 (no refactoring)
2. Use Battle-Tested Tools (no custom code)
3. Contracts First (OpenAPI before code)
4. Evidence Always (SBOM, SLSA, SARIF, tests)
5. Binary Gates (PASS or FAIL)

**Banned patterns:**
- ❌ Build monolith, refactor later
- ❌ Custom LLM wrapper (use LangGraph)
- ❌ Defer tests/evidence ("we'll add later")
- ❌ Subjective gates ("looks good")

---

## 📝 License

Proprietary. All rights reserved.

---

## 🏛️ Constitutional Framework

**"Enterprise from Line 1. Always."**

[CONSTITUTION.md](CONSTITUTION.md) | [AI_INSTRUCTIONS.md](AI_INSTRUCTIONS.md) | [SESSION_HANDOFF.md](SESSION_HANDOFF.md)
