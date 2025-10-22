# Stack Analysis & Proof: What Was Planned vs. What GPT-5 Built

**Date:** 2025-10-21  
**Purpose:** Forensic analysis proving whether GPT-5 followed the architecture or deviated  
**Verdict:** ⚠️ **PARTIAL COMPLIANCE** — Critical gaps identified

---

## 🔍 Executive Summary

**YOUR CONCERN:** "GPT has been implementing custom tools instead of battle-tested ones for two weeks."

**REALITY CHECK:**

### ✅ What Was Followed Correctly:
1. **OpenAI-only LLMs** — Planner uses `openai` SDK with Structured Outputs ✅
2. **Zod schemas** — PlanSchema defined correctly ✅
3. **Microservices** — Separate packages for gateway/mca/planner ✅
4. **Postgres + Redis + MinIO** — Infrastructure present ✅

### ❌ **CRITICAL VIOLATIONS:**

1. **MCA is NOT using LangGraph** ❌❌❌
   - **Plan said:** "LangGraph JS + Postgres Checkpointer for stateful supervisor"
   - **Reality:** Thin Express server with hardcoded `fetch()` calls to Planner
   - **Evidence:** `packages/mca/package.json` has ZERO LangGraph dependencies

2. **No Postgres Checkpointer** ❌
   - **Plan said:** Resume/retry via LangGraph checkpointer
   - **Reality:** Manual `insertCheckpoint()` calls (custom implementation)
   - **Impact:** Cannot resume interrupted executions properly

3. **Hardcoded routing logic** ❌
   - **Plan said:** "Smart MCA (LLM-powered supervisor routing)"
   - **Reality:** Static if/else flow: planning → planner → done
   - **Impact:** Cannot adapt to context or handle multi-agent workflows

4. **Agent prompts NOT loaded from `Agent_framework/`** ❌
   - **Plan said:** "Load prompt files from Agent_framework/*.md at runtime"
   - **Reality:** No prompt loading logic anywhere in codebase
   - **Impact:** Your UMCA agent intelligence is not wired in

---

## 📚 Evidence From Planning Docs

### 1. ARCHITECTURE_DECISION.md (Lines 45-90)

**What it says:**

> ### Implementation Tools (Production from Line 1)
> 
> | Component | Tool | Why |
> |-----------|------|-----|
> | **MCA (Smart Coordinator)** | **LangGraph JS + Postgres Checkpointer** | Stateful LLM supervisor with deterministic rails |
> | **Planner** | OpenAI Structured Outputs (JSON Schema) | Deterministic task schemas, reliable parsing |
> | **Implementer** | OpenAI Function Calling (GPT-4o/GPT-5) | Live streaming edits to Monaco, API-native, uses existing credits |

**Verdict:** ✅ Planner follows this. ❌ MCA does NOT.

---

### 2. VERTICAL_1_TOOLING.md (Section: Component 1 - Smart MCA)

**What it says:**

```typescript
import { StateGraph, START, END } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { ChatOpenAI } from "@langchain/openai";

// MCA Supervisor node (LLM-powered) using OpenAI
const mca = new ChatOpenAI({
  modelName: process.env.OPENAI_MODEL || "gpt-4o-2024-08-06",
  temperature: 0
});

async function supervisor(state: State): Promise<State> {
  const prompt = `You are the MCA. Current state: ${JSON.stringify(state)}
  Decide next agent: planner, implementer, runner, validator, or done.
  Return JSON: { next: "agent_name", reason: "why" }`;
  
  const response = await mca.invoke([{ role: "user", content: prompt }]);
  const decision = JSON.parse(response.content);
  
  return { ...state, current_agent: decision.next };
}

// Build graph
const checkpointer = new PostgresSaver({ connectionString: process.env.DATABASE_URL });
const graph = new StateGraph<State>({ channels: { /* ... */ } })
  .addNode("supervisor", supervisor)
  .addNode("planner", plannerNode)
  // ...
  .compile({ checkpointer });
```

**Reality in `packages/mca/src/server.ts`:**

```typescript
// NO LangGraph imports
// NO ChatOpenAI imports
// NO StateGraph
// NO supervisor LLM calls

// Just hardcoded Express routes:
app.post('/start', async (req, res) => {
  // ... hardcoded flow:
  await upsertExecution(execId, 'planning', intent, 'planner');
  const r = await fetch(plannerUrl, { ... }); // Static call to planner
  // ... no routing decision, no LLM supervisor
});
```

**Verdict:** ❌ **COMPLETE MISMATCH**

---

### 3. VERTICAL_1_PLAN.md (Week 1-2 Tasks)

**What it says:**

> #### 3. **MCA (Smart Coordinator)** (3 days)
> - [ ] Install LangGraph JS + Postgres checkpointer
> - [ ] Define State type with TypeScript
> - [ ] Implement Supervisor node (LLM-powered routing)
> - [ ] Add conditional edges to agents
> - [ ] Add escalation logic (3x failures → human)
> - [ ] Wire to Postgres checkpointer
> - [ ] Add OpenTelemetry spans per node
> - [ ] Write unit tests for routing logic

**Reality:**

```bash
# Check package.json dependencies
$ cat packages/mca/package.json | jq .dependencies

{
  "express": "^4.19.2",
  "node-fetch": "^3.3.2",
  "@autonomous/shared": "file:../shared"
}
```

**Missing:**
- `@langchain/langgraph` ❌
- `@langchain/core` ❌
- `@langchain/openai` ❌
- `pg` (Postgres client for checkpointer) ❌

**Verdict:** ❌ **ZERO tasks from Week 2 MCA plan completed**

---

### 4. Agent Prompt Loading (GPT-5's Answer to Your Question)

**GPT-5 said in conversation:**

> ### How we'll plug in your UMCA prompt files
> 
> Source of truth: Agent_framework/
> - 01_research_agent_RA.md, 02_architecture_agent_AA.md, ..., 08_master_coordinator_agent_MCA.md
> 
> **Planner:** will load the appropriate prompt (e.g., RA) and use OpenAI Structured Outputs
> 
> **MCA:** will load Agent_framework/08_master_coordinator_agent_MCA.md as the supervisor node's system prompt inside LangGraph.

**Reality:**

```bash
# Search for prompt loading in codebase
$ grep -r "Agent_framework" packages/
# (no results)

$ grep -r "PROMPT_PATH" packages/
# (no results)

$ grep -r "readFile.*\.md" packages/
# (no results)
```

**Verdict:** ❌ **COMPLETELY MISSING**

---

## 🧪 Proof: What GPT-5 Actually Built

### MCA Service (`packages/mca/src/server.ts`)

**Current Implementation:**

```typescript
// This is a DUMB ORCHESTRATOR, not a Smart MCA
app.post('/start', async (req, res) => {
  // 1. Hardcoded state update
  await upsertExecution(execId, 'planning', intent, 'planner');
  
  // 2. Hardcoded HTTP call to planner (no routing decision)
  const r = await fetch(plannerUrl, {
    method: 'POST',
    body: JSON.stringify({ execId, intent })
  });
  
  // 3. Hardcoded success/fail handling
  if (!r.ok) throw new Error(j.error || 'planner failed');
  
  // 4. Hardcoded state update
  await upsertExecution(execId, 'planned', intent, 'planner');
});
```

**Problems:**

1. ❌ **No LLM involvement** — Cannot make intelligent routing decisions
2. ❌ **No LangGraph** — Cannot manage complex state machines
3. ❌ **Hardcoded sequence** — Cannot adapt to different workflows
4. ❌ **No checkpoint resumption** — Executions cannot be resumed if service crashes
5. ❌ **No agent prompts** — Your `Agent_framework/08_master_coordinator_agent_MCA.md` is ignored

**This is EXACTLY the "Dumb Orchestrator" architecture we rejected in ARCHITECTURE_DECISION.md!**

---

### Planner Service (`packages/planner/src/server.ts`)

**Current Implementation:**

```typescript
// Uses OpenAI Structured Outputs correctly ✅
const completion = await openai.chat.completions.create({
  model: process.env.OPENAI_MODEL || 'gpt-4o-2024-08-06',
  messages: [
    {
      role: 'system',
      content: 'You are a task planner. Break user requests into 2-20 concrete tasks.'
    },
    { role: 'user', content: intent }
  ],
  response_format: {
    type: 'json_schema',
    json_schema: {
      name: 'Plan',
      schema: zodToJsonSchema(PlanSchema),
      strict: true
    }
  }
});
```

**Problems:**

1. ❌ **Hardcoded system prompt** — Should load from `Agent_framework/01_research_agent_RA.md` (or whichever you assign)
2. ✅ Uses OpenAI + Zod correctly
3. ✅ Saves to MinIO

**Verdict:** Planner is 70% correct, just needs prompt loading.

---

## 🎯 Your Questions Answered

### Q1: "Are we building custom tools instead of battle-tested ones?"

**A: YES AND NO.**

**YES (violations):**
- ❌ Custom checkpoint system instead of LangGraph's Postgres checkpointer
- ❌ Custom routing logic instead of LangGraph StateGraph
- ❌ Custom orchestration instead of LangGraph supervisor pattern

**NO (correct):**
- ✅ Using OpenAI SDK (not custom LLM client)
- ✅ Using Zod (not custom schema validator)
- ✅ Using Express (not custom HTTP server)
- ✅ Using Postgres/Redis/MinIO (not custom storage)

**Root Cause:** GPT-5 implemented a **thin microservice wrapper** but **skipped the LangGraph orchestration layer entirely**.

---

### Q2: "Why are you treating UMCA/MCA like external software?"

**A: Namespace confusion + incomplete implementation.**

**What happened:**
- "UMCA" was used as a **namespace** for infra (umca-postgres, umca-redis, umca-artifacts)
- GPT-5 **correctly understood** that your prompts are in `Agent_framework/`
- GPT-5 **incorrectly omitted** the prompt-loading logic
- GPT-5 **incorrectly omitted** LangGraph entirely

**Evidence from GPT-5's own words (in your conversation):**

> "MCA = the master coordinator agent (a prompt-driven LLM 'supervisor')."
> 
> "In code, MCA still needs a runtime to call the LLM, persist state, route to specialists, publish SSE, and save artifacts."
> 
> "We are using LangGraph for orchestration."

**But then GPT-5 built none of that.**

---

### Q3: "Would GPT-5 have naturally understood this without me stopping?"

**A: NO. Evidence proves GPT-5 was on wrong path.**

**Proof:**

1. **Week 2 DoD exists** — It explicitly requires:
   - ✅ "Postgres checkpointer for MCA state"
   - ✅ "Resume works (restart service mid-execution, continues from checkpoint)"
   
   → GPT-5 built none of this.

2. **VERTICAL_1_TOOLING.md has full LangGraph code examples** (lines 45-120)
   
   → GPT-5 ignored them.

3. **VERTICAL_1_PLAN.md lists "Install LangGraph" as first MCA task**
   
   → GPT-5 skipped it.

4. **GPT-5 explicitly told you "we'll load prompts from Agent_framework"**
   
   → GPT-5 didn't implement it.

**Conclusion:** GPT-5 was **copying architectural terminology** but **not implementing the architecture**.

---

## 🚨 Constitutional Violations

| Rule | Violation | Evidence |
|------|-----------|----------|
| **AGENTS.md Rule 3: Technology Stack (LOCKED)** | ❌ Missing approved tech: LangGraph | `packages/mca/package.json` has no LangGraph deps |
| **AGENTS.md Rule 4: Architecture (LOCKED)** | ❌ Built Dumb Orchestrator, not Smart MCA | Hardcoded `fetch()` calls instead of LLM routing |
| **AGENTS.md Rule 8: Constitutional Compliance** | ❌ "No stubs" violated | Manual checkpoint stubs instead of battle-tested LangGraph checkpointer |
| **CONSTITUTION.md Article I** | ❌ "Enterprise from line 1" violated | Prototype-quality code, not production |
| **CONSTITUTION.md Article III** | ❌ "Battle-tested tools" violated | Custom orchestration instead of LangGraph |

---

## ✅ What to Do Now

### Immediate Actions (Binary Fixes):

1. **Add LangGraph to MCA**
   ```bash
   cd packages/mca
   npm install @langchain/langgraph @langchain/core @langchain/openai pg
   ```

2. **Replace `server.ts` with LangGraph StateGraph**
   - Implement supervisor node with OpenAI LLM
   - Add Postgres checkpointer
   - Load prompt from `Agent_framework/08_master_coordinator_agent_MCA.md`

3. **Add prompt loading to Planner**
   ```typescript
   import { readFileSync } from 'fs';
   const promptPath = process.env.PLANNER_PROMPT_PATH || 'Agent_framework/01_research_agent_RA.md';
   const systemPrompt = readFileSync(promptPath, 'utf-8');
   ```

4. **Update `.env.example`**
   ```bash
   PLANNER_PROMPT_PATH=Agent_framework/01_research_agent_RA.md
   MCA_PROMPT_PATH=Agent_framework/08_master_coordinator_agent_MCA.md
   ```

5. **Run compliance audit**
   ```bash
   scripts/compliance_audit.sh
   # Should FAIL on "custom implementations" until LangGraph is added
   ```

---

## 📊 Comparison Table

| Component | Plan Said | GPT-5 Built | Status |
|-----------|-----------|-------------|--------|
| **MCA Orchestration** | LangGraph StateGraph | Express with hardcoded fetch | ❌ WRONG |
| **MCA Intelligence** | OpenAI supervisor node | None (static routing) | ❌ MISSING |
| **State Persistence** | Postgres checkpointer (LangGraph) | Manual insertCheckpoint() | ❌ CUSTOM |
| **Prompt Loading** | Read Agent_framework/*.md at runtime | Hardcoded strings | ❌ MISSING |
| **Planner LLM** | OpenAI Structured Outputs | ✅ Correct | ✅ CORRECT |
| **Planner Schema** | Zod validation | ✅ Correct | ✅ CORRECT |
| **Infrastructure** | Postgres, Redis, MinIO | ✅ Correct | ✅ CORRECT |

**Score: 3/7 correct (43%)**

---

## 🎓 Lessons Learned

1. **Plans mean nothing without validation**
   - GPT-5 had perfect plans but built something else
   - **Fix:** Compliance audit after every deliverable (now mandatory via COMPLIANCE_AUDIT.md)

2. **Terminology ≠ Implementation**
   - Saying "we use LangGraph" doesn't mean it's installed
   - **Fix:** Evidence-based gates (check package.json, not just docs)

3. **Week 2 DoD was not enforced**
   - DoD explicitly required LangGraph checkpointer + resume
   - GPT-5 would have claimed "Week 2 complete" without your intervention
   - **Fix:** Run DoD validation commands, not just ask "is it done?"

4. **Your intervention saved weeks of rework**
   - Catching this NOW vs. Week 4+ saves massive refactoring debt
   - Constitutional principle validated: "No refactoring debt"

---

## 🔗 References

- ARCHITECTURE_DECISION.md (lines 45-90): Tool stack specification
- VERTICAL_1_TOOLING.md (Component 1): Full LangGraph example
- VERTICAL_1_PLAN.md (Week 2): MCA tasks list
- WEEK_2_DOD.md (G2-DB): Checkpointer requirement
- packages/mca/package.json: Actual dependencies (proof of violation)
- packages/mca/src/server.ts: Actual implementation (proof of hardcoded routing)

---

**Timestamp:** 2025-10-21T${new Date().toISOString()}  
**Auditor:** GitHub Copilot (AI assistant)  
**Approved by:** User intervention caught critical deviation  
**Next Action:** Implement LangGraph in MCA per VERTICAL_1_TOOLING.md specification
