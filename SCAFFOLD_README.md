# How to Scaffold the Complete Project

This folder contains **governance + implementation reference**. Use the scaffolding script to create the actual project structure.

## Quick Start (2 Commands)

```bash
# 1. Run the scaffolding script
python3 scaffold.py

# 2. Done! You now have the complete project structure
```

## What the Script Does

The `scaffold.py` script:

1. **Reads** `docs/11_211025/delivery.md` (your implementation reference)
2. **Extracts** all code blocks marked with file paths (e.g., `> \`apps/gateway/src/server.ts\``)
3. **Creates** the complete directory structure
4. **Writes** all files to disk:
   - 10 services (TypeScript stubs)
   - 9 OpenAPI 3.1 specs
   - 2 JSON schemas
   - Docker Compose + OTEL + Grafana configs
   - GitHub Actions workflows (SLSA, CodeQL, Trivy, Semgrep)
   - Dockerfiles for all services
   - tsconfig.json, turbo.json, .gitignore

**Result:** Production-ready enterprise skeleton, ready to run.

## Manual Method (If You Prefer AI)

If you want AI to do it manually instead of using the script:

```
Read docs/11_211025/delivery.md and extract all code blocks marked with
file paths (pattern: "> `path/to/file`" followed by code block).

Create each file in the path specified. For example:

> `apps/gateway/src/server.ts`
→ Create file at: apps/gateway/src/server.ts

Also create:
- Dockerfiles for all 10 services (boilerplate Node.js Alpine)
- tsconfig.json in each service
- turbo.json at root
- .gitignore
```

## After Scaffolding

Once files are created:

```bash
# 1. Create GitHub repo
git init
git add .
git commit -m "Initial commit: Enterprise skeleton from delivery.md"
gh repo create autonomous-platform --private --source=. --push

# 2. Configure environment
cp .env.example .env
# Edit .env and set secure passwords

# 3. Start infrastructure
docker-compose -f ops/dev/docker-compose.yml up -d

# 4. Install dependencies (if running locally)
npm install

# 5. Test services
for port in 7011 7012 7013 7014 7015 7016 7017 7018; do
  echo "Testing port $port..."
  curl -f http://localhost:$port/healthz && echo " ✅" || echo " ❌"
done
```

## File Structure After Scaffolding

```
autonomous-platform/
├── apps/
│   ├── gateway/                    # API Gateway (port 8080)
│   │   ├── src/
│   │   │   ├── server.ts
│   │   │   └── problem.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│   └── mca-orchestrator/           # LangGraph Orchestrator
│       ├── src/
│       │   ├── graph/
│       │   │   ├── state.ts
│       │   │   ├── gates.ts
│       │   │   └── natsAdapter.ts
│       │   ├── types.ts
│       │   └── index.ts
│       ├── package.json
│       ├── tsconfig.json
│       └── Dockerfile
├── services/
│   ├── planner-ra/                 # Planner Agent (port 7011)
│   ├── architect-aa/               # Architect Agent (port 7012)
│   ├── implementer-ia/             # Implementer Agent (port 7013)
│   ├── runner-da/                  # Runner/Test Agent (port 7014)
│   ├── security-sa/                # Security Scan Agent (port 7015)
│   ├── quality-qa/                 # Quality Gate Agent (port 7016)
│   ├── finops-fops/                # FinOps Agent (port 7017)
│   └── db-layer-dba/               # DB Layer Agent (port 7018)
│       └── (each has: src/server.ts, package.json, tsconfig.json, Dockerfile)
├── packages/
│   └── contracts/
│       ├── openapi/                # 9 OpenAPI 3.1 specs
│       └── schema/                 # 2 JSON schemas
├── ops/
│   └── dev/
│       ├── docker-compose.yml      # Full stack (NATS, MinIO, Postgres, OTEL, Grafana)
│       ├── otel-collector.yaml
│       └── grafana/
├── .github/
│   └── workflows/
│       ├── slsa.yml                # SLSA L3 provenance
│       ├── codeql.yml              # Code scanning
│       ├── trivy.yml               # Container scanning
│       └── semgrep.yml             # SAST
├── docs/
│   ├── 11_211025/
│   │   ├── delivery.md             # 📖 MAIN IMPLEMENTATION REFERENCE
│   │   └── TECH_STACK_CLARIFICATION.md
│   └── VISION.md
├── CONSTITUTION.md                 # 🏛️ Supreme law (immutable)
├── AI_INSTRUCTIONS.md              # 🤖 Workflow for AI agents
├── .aidigest                       # 🔧 Machine-readable rules
├── START_HERE.md                   # 👋 Entry point
├── .env.example                    # 🔐 Environment template
├── turbo.json                      # ⚡ Turborepo config
├── package.json                    # 📦 Root package (pnpm workspace)
└── tsconfig.json                   # 🔧 TypeScript config
```

## Troubleshooting

**Script fails with "delivery.md not found":**
- Make sure you're running from the root of `autonomous-platform-fresh-start/`
- Check that `docs/11_211025/delivery.md` exists

**No files created:**
- Check Python version: `python3 --version` (needs 3.6+)
- Run with verbose output: Add `print()` statements in `scaffold.py`

**AI method creates wrong paths:**
- Provide the exact file path pattern from delivery.md
- Example: `> \`apps/gateway/src/server.ts\`` → `apps/gateway/src/server.ts`

## Week 1 Goal

After scaffolding, your Week 1 goal is:

**E2E Execution Working:**
```bash
# Start all services
docker-compose -f ops/dev/docker-compose.yml up -d

# Create execution
curl -X POST http://localhost:8080/executions \
  -H "Content-Type: application/json" \
  -d '{"userIntent": "Create TODO app", "budgetLimit": 100}'

# Check status (use Location header from above)
curl http://localhost:8080/executions/{id}

# Verify artifacts in MinIO
# → junit.xml, coverage.json, sbom.json, semgrep.sarif

# Check traces in Grafana
open http://localhost:3000
```

**Exit Criteria:**
- ✅ All 8 services respond to health checks
- ✅ POST /executions returns 202 + Location
- ✅ Orchestrator runs all 7 nodes (planner → architect → implement → runner → security → quality → finops)
- ✅ Gates recorded (G0, G1, G2, G3, BUDGET)
- ✅ Artifacts uploaded to MinIO
- ✅ Traces visible in Grafana

---

**Remember:** This skeleton follows your CONSTITUTION from line 1. No refactoring nightmares ahead. 🎉
