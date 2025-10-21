# Prompt: Create AGENTS.md for Autonomous Platform

**Your Task:** Create a new `AGENTS.md` file for the autonomous coding platform repository.

**Context:** I'm a non-technical founder using AI agents (Claude, GPT, Copilot, etc.) to build a fully autonomous, multi-agent AI coding system. This AGENTS.md file will be the **supreme law** that ALL AI builders must follow across ALL sessions, weeks, phases, and microservices.

---

## 🎯 Purpose of AGENTS.md

**What it MUST do:**
1. **Define outcome-based workflow** (not step-by-step code)
2. **Enforce constitutional principles** (enterprise from line 1, no refactoring, evidence-driven)
3. **Provide iteration protocol** (fix → retry → escalate, NOT "copy-paste and fail")
4. **Lock constraints** (tech stack, architecture, forbidden patterns)
5. **Give wiggle room** (HOW to achieve outcomes is flexible)
6. **Apply universally** (same rules in Week 1 as in 3 months)

**What it MUST NOT do:**
1. ❌ Provide exact code to copy-paste
2. ❌ Be task-specific (no "Week 1" or "Gateway service" instructions)
3. ❌ Lock implementation details (file paths, dependency versions)
4. ❌ Skip iteration loops (AI must fix until green, not just report)

---

## 📚 Source Material to Incorporate

**You MUST read and incorporate principles from these files:**

### 1. CONSTITUTION.md
- Article I: Enterprise from Line 1
- Article II: Anti-Refactoring Amendment
- Article III: Battle-Tested Doctrine
- Article V: Evidence Requirement
- Article VI: Iteration Principle

**Key principles:**
- ✅ Production from line 1 (no stubs, no prototypes)
- ✅ Microservices from day 1 (no monoliths)
- ✅ Battle-tested tools only (no custom if library exists)
- ✅ Evidence-driven (all claims backed by artifacts)
- ✅ Binary gates (PASS/FAIL, no subjective)

### 2. Current AGENTS.md
- Evidence-based workflow (Rules 1-12)
- Iteration protocol (fix → retry max 3 → escalate)
- Forbidden patterns (anti-patterns table)
- Evidence directory structure
- Validation gates (lint, typecheck, test)

**Key principles:**
- ✅ No claim without saved, machine-verifiable evidence
- ✅ Discover before act (search/read before editing)
- ✅ Baseline → Change → Final (prove acceptance met)
- ✅ Iterate until green (not "follow protocol if broken")

### 3. ARCHITECTURE_DECISION.md
- Smart MCA + Smart Specialists + Zero-Trust Validator
- OpenAI-only stack (GPT-4o/GPT-5 for all agents)
- Cost vs autonomy trade-off (spend on LLMs to eliminate human intervention)

**Key principles:**
- ✅ Smart agents analyze results (not just return raw tool output)
- ✅ Zero-trust validation (independently verify all claims)
- ✅ Autonomous over cheap (90% autonomy target)

### 4. VERTICAL_1_TOOLING.md
- Technology stack (OpenAI, LangGraph, E2B, MinIO, Postgres, Redis)
- Forbidden: Anthropic (we use OpenAI-only)
- Infrastructure: Self-hosted (MinIO, Postgres, Redis via Docker)

**Key principles:**
- ✅ OpenAI-only (no Anthropic, no multi-vendor in V1)
- ✅ Production tools from line 1 (E2B, LangGraph, OpenTelemetry)
- ✅ Microservices in monorepo (Turborepo structure)

---

## 🛠️ Technical Requirements

### File Specifications (Per Official Docs):
- **Filename:** `AGENTS.md`
- **Location:** Repository root
- **Format:** Markdown
- **Length:** Maximum 2 pages (~400 lines)
- **Style:** Short, self-contained statements
- **Scope:** Broadly applicable (NOT task-specific)

### Content Structure:

**Required sections:**
1. **Metadata** (version, enforcement, last updated)
2. **Project Overview** (what we're building, why)
3. **Critical Rules** (numbered, verifiable, binary)
4. **Technology Stack** (locked: OpenAI, LangGraph, E2B, MinIO, Postgres, Redis)
5. **Architecture Constraints** (microservices, monorepo, Smart MCA)
6. **Forbidden Patterns** (anti-patterns with regex)
7. **Evidence Requirements** (directory structure, artifacts)
8. **Iteration Protocol** (fix → retry → escalate)
9. **Validation Gates** (lint, typecheck, test, coverage ≥80%)
10. **Error Handling** (when to iterate, when to escalate)

---

## 🔒 Non-Negotiable Constraints (LOCK THESE)

### Technology Stack:
```
APPROVED (ONLY use these):
✅ Languages: TypeScript, JavaScript (Node.js 20+)
✅ LLM: OpenAI ONLY (GPT-4o, GPT-5) - NO Anthropic, NO multi-vendor
✅ Orchestration: LangGraph JS + Postgres Checkpointer
✅ Code Generation: OpenAI Function Calling (NOT Anthropic Text Editor Tool)
✅ Sandbox: E2B Sandbox → Firecracker migration path
✅ Storage: MinIO (S3-compatible)
✅ Database: Postgres 16+
✅ Message Bus: Redis Streams → NATS JetStream migration path
✅ Observability: OpenTelemetry + Tempo + Grafana
✅ Cost Tracking: Langfuse

FORBIDDEN:
❌ Anthropic Claude (we use OpenAI-only)
❌ SQLite (not production-grade)
❌ In-memory storage (not persistent)
❌ Monolithic architecture
❌ Custom implementations of battle-tested tools
```

### Architecture:
```
REQUIRED:
✅ Microservices from day 1 (packages/gateway, packages/mca, etc.)
✅ Monorepo with Turborepo
✅ Smart MCA (LLM-powered coordinator)
✅ Smart Specialists (Planner, Implementer, Validator with LLM analysis)
✅ Zero-Trust Validator (independently verifies all claims)

FORBIDDEN:
❌ Monolith architecture
❌ Dumb orchestrator with smart workers
❌ Workers that self-report without validation
```

### Constitutional Principles:
```
REQUIRED:
✅ Production from line 1 (no stubs, no prototypes, no "TODO: implement")
✅ Evidence-driven (all artifacts stored in MinIO)
✅ Binary gates (PASS/FAIL, no subjective)
✅ Battle-tested tools (no custom if library exists)
✅ Vertical slices (complete one feature before starting next)
✅ Iteration to green (fix → retry → escalate, NOT "report and wait")

FORBIDDEN:
❌ "Build monolith, refactor later"
❌ "Use custom code, replace with library later"
❌ "Ship prototype, rebuild in Phase N"
❌ Hardcoded success (return {success: true} without real validation)
❌ Path guessing (must search/read before editing)
```

---

## 📐 Flexible Areas (GIVE WIGGLE ROOM)

**AI builders CAN decide:**
- ✅ Exact file structure (as long as microservices in packages/)
- ✅ Exact function/variable names
- ✅ Exact dependency versions (as long as using approved tech)
- ✅ Port numbers (if conflicts arise)
- ✅ Container names
- ✅ HOW to achieve outcomes (as long as gates PASS)

**AI builders CANNOT decide:**
- ❌ WHICH technologies to use (stack is locked)
- ❌ Architecture (microservices is locked)
- ❌ Skip evidence collection
- ❌ Skip validation gates
- ❌ Proceed if gates FAIL

---

## 🔄 Iteration Protocol (CRITICAL)

**This is the most important section. AI builders MUST iterate, not just report.**

```
If validation fails (lint, typecheck, test, gate):

1. DIAGNOSE: Read error logs, understand root cause
2. FIX: Adjust implementation (NOT architecture, unless approved)
3. RETRY: Re-run validation command
4. EVIDENCE: Save error + fix to .automation/evidence/iterations/
5. REPEAT: Max 3 iterations per issue

After 3 failed attempts:
🚨 ESCALATE with:
- Issue description
- What was tried (3 attempts with evidence)
- Error logs
- Proposed solution or "need guidance"

SUCCESS = All gates PASS (green), NOT "followed protocol"
```

**Examples of iteration:**
- ✅ Dependency version conflict? Try compatible versions until tests pass
- ✅ Test failing? Fix code and re-run until green
- ✅ Port already in use? Change port in config and retry
- ✅ Schema validation error? Adjust schema until strict mode passes

**NOT iteration (escalate immediately):**
- ❌ Architecture decision needed (Smart MCA vs Dumb orchestrator)
- ❌ Technology not in approved list (want to use Anthropic)
- ❌ Security vulnerability found (escalate, don't fix blindly)
- ❌ Massive scope drift (refactoring multiple services)

---

## 📊 Evidence Requirements (FROM AGENTS.md)

**Every task MUST produce:**

```
.automation/evidence/$TASK/
  discovery.txt          # Proof targets exist before editing
  baseline.json          # Metrics before change
  final.json             # Metrics after change
  valid/
    lint.txt             # Lint output (exit 0)
    typecheck.txt        # TypeScript check (exit 0)
    tests.json           # Test results (all passing)
    coverage.json        # Coverage report (≥80%)
  artifacts.sha256       # Hashes of changed files
  task_provenance.json   # Task metadata + file list
  audit.json             # npm audit (no new high/critical)
  env.txt                # Environment (node -v, npm -v, git rev-parse HEAD)
  summary.md             # Links to all artifacts
```

**Validation gates (MUST pass in order):**
1. `npm run lint` → exit 0
2. `npm run typecheck` → exit 0
3. `npm test` → exit 0, coverage ≥80%
4. Custom acceptance criteria (from task DoD)

**If any gate fails:** Iterate (fix → retry), don't just report.

---

## 🚫 Forbidden Patterns (WITH REGEX)

**These patterns are auto-detectable violations:**

| Pattern | Regex | Violation | Action |
|---------|-------|-----------|--------|
| Path guessing | `(?i)\b(think\|probably\|should be at)\b` | Claims without evidence | HALT, run discovery first |
| Hardcoded success | `return\s*\{\s*success:\s*true\s*\}` | Fake green | HALT, implement real validation |
| TypeScript any | `:\s*any\b` | Type unsafety | Fix with proper types |
| TODO/FIXME | `(?i)\bTODO\b\|\bFIXME\b` | Incomplete work | Complete before PR |
| Console.log in src/ | `src/.*console\.log` | Noisy production logs | Use proper logger |
| Anthropic imports | `from ['"]@anthropic` | Wrong LLM vendor | Use OpenAI |

---

## 🎯 Success Criteria for AGENTS.md

**Your AGENTS.md is COMPLETE when:**

1. ✅ **All constitutional principles** from CONSTITUTION.md are incorporated
2. ✅ **Iteration protocol** mandates fix→retry→escalate (NOT report-and-wait)
3. ✅ **Technology stack** is locked (OpenAI-only, microservices, approved tools)
4. ✅ **Evidence requirements** are clear (directory structure, artifacts)
5. ✅ **Forbidden patterns** are explicit (with regex for auto-detection)
6. ✅ **Wiggle room** is clear (what AI can/cannot decide)
7. ✅ **NOT task-specific** (applies to Week 1, Week 50, all microservices)
8. ✅ **Maximum 2 pages** (~400 lines)
9. ✅ **Short, self-contained statements** (easy to parse)
10. ✅ **Machine-verifiable** (no subjective "looks good")

**Your AGENTS.md is WRONG if:**
- ❌ Contains exact code to copy-paste
- ❌ Task-specific instructions ("Week 1: do X")
- ❌ Allows Anthropic or other non-approved tech
- ❌ No iteration protocol (just "report errors")
- ❌ No evidence requirements
- ❌ Subjective success criteria ("seems good")
- ❌ Over 2 pages / 400 lines

---

## 📋 Template Structure (USE THIS)

```markdown
# AGENTS.md

## Metadata
- Version: 1.0.0
- Enforcement: Repository-wide, all AI builders
- Last Updated: [DATE]
- Authority: Supreme law for all development
- Purpose: Enforce constitutional principles across all sessions/phases

---

## 🎯 Project Overview

[Brief description of autonomous coding platform]
[Smart MCA + Specialists + Zero-Trust Validator]
[OpenAI-only stack, microservices, evidence-driven]

---

## 🔒 Critical Rules (Numbered, Binary)

### 1. Evidence-Based ONLY
[No claim without saved, machine-verifiable evidence]

### 2. Discover Before Act
[Search/read before editing, save discovery.txt]

### 3. Technology Stack (LOCKED)
[OpenAI-only, LangGraph, E2B, MinIO, Postgres, Redis]
[FORBIDDEN: Anthropic, SQLite, monoliths, custom implementations]

### 4. Architecture (LOCKED)
[Microservices in monorepo, Smart MCA, Zero-Trust Validator]

### 5. Validation Gates (MUST PASS)
[lint → typecheck → test (≥80% coverage) → acceptance]

### 6. Iteration Protocol (CRITICAL)
[If fail: diagnose → fix → retry (max 3) → escalate]
[SUCCESS = green, NOT "followed protocol"]

### 7. Evidence Requirements
[Directory structure: .automation/evidence/$TASK/...]
[All artifacts saved, hashed, provenance tracked]

### 8. Constitutional Compliance
[Production from line 1, no refactoring, vertical slices]

---

## 🚫 Forbidden Patterns

[Table with Pattern | Regex | Violation | Action]

---

## 🔄 Error Handling

[When to iterate vs when to escalate]

---

## 📚 References
- CONSTITUTION.md
- ARCHITECTURE_DECISION.md
- VERTICAL_1_TOOLING.md
```

---

## 🚀 Final Instructions for You (Copilot)

**Your task:**
1. **Read** CONSTITUTION.md, current AGENTS.md, ARCHITECTURE_DECISION.md, VERTICAL_1_TOOLING.md
2. **Extract** all constitutional principles, iteration protocols, tech stack locks
3. **Synthesize** into a single, universal AGENTS.md (max 2 pages)
4. **Ensure** it applies to ALL sessions/weeks/microservices (not task-specific)
5. **Emphasize** iteration protocol (fix→retry→escalate, not report-and-wait)
6. **Lock** tech stack (OpenAI-only, microservices, approved tools)
7. **Give wiggle room** (HOW to achieve outcomes is flexible)

**Test your AGENTS.md:**
- ✅ Can a new AI builder read this and understand what's required? (YES)
- ✅ Does it prevent Anthropic usage? (YES)
- ✅ Does it mandate iteration to green? (YES)
- ✅ Does it apply 3 months from now? (YES)
- ✅ Is it under 2 pages? (YES)
- ❌ Does it contain exact code? (NO)
- ❌ Is it task-specific? (NO)

---

**Create the AGENTS.md file now.**
