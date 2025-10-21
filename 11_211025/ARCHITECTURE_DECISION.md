# Architecture Decision Record: Smart MCA + Smart Specialists + Zero-Trust Validator

**Date:** 2025-10-21  
**Status:** APPROVED  
**Decision Makers:** User (Product Owner), Claude (Technical Architect)

---

## Context

We need to choose an architecture for our autonomous AI coding system. After extensive research and analysis, we discovered a critical problem with LLM-based research: **prompt bias leads to contradictory recommendations**.

### The Problem: GPT's Contradictory Research

**Round 1 (Cost-Optimized Framing):**
- **Question:** "Which architecture is closer to industry standards?"
- **Recommendation:** Dumb orchestrator + 3 smart workers + 5 dumb workers
- **Rationale:** Cheaper, simpler, follows industry patterns
- **Evidence:** GitHub Copilot, Cursor, Replit use "thin orchestration"

**Round 2 (Autonomy-Optimized Framing):**
- **Question:** "Are there autonomous systems with smart coordinators?"
- **Recommendation:** Smart MCA + smart specialists + zero-trust validator
- **Rationale:** Better autonomy, industry-aligned with verification patterns
- **Evidence:** **Same products** (Copilot, Cursor, Replit) now prove "smart coordination"

### Critical Discovery: The "Good Day / Bad Day" Problem

LLMs rationalize **any position** based on question framing:
- Ask "did you have a BAD day?" → searches for negative memories
- Ask "did you have a GOOD day?" → searches for positive memories
- **Neutral question:** "how was your day?" → balanced assessment

**This means:** We cannot trust LLM research that's been primed with a hypothesis.

---

## Decision

**We choose: Smart MCA + Smart Specialists + Zero-Trust Validator**

### Architecture Components

```
Smart MCA (LLM Supervisor via LangGraph)
  ↓ coordinates, routes, escalates
  ↓
Smart Specialist Agents:
  - Planner (LLM) - task decomposition with context awareness
  - Research Agent (LLM) - evaluates libraries, approaches
  - Architect (LLM) - design decisions, ADRs, contracts
  - Implementer (LLM) - code generation with OpenAI Function Calling (GPT-4o/GPT-5)
  - Security (LLM) - analyzes scans, proposes remediations
  - Quality (LLM) - reviews code quality beyond metrics
  - DevOps/Runner (tool-first) - executes tests in isolated sandbox
  - DBA (LLM) - schema design, migration planning
  ↓
Smart Zero-Trust Validator (LLM + Tools)
  - Independently runs tests/scans
  - Doesn't trust worker reports
  - Issues remediation contracts
  - Escalates failures (3x) to MCA
  ↓
MCA Decision:
  - PASS → Complete
  - FAIL → Remediation loop
  - FAIL 3x → Escalate to human
```

---

## Rationale

### 1. Our Goal is Different from Industry Products

**GitHub Copilot / Cursor / Replit:**
- Goal: AI **assistants** (human-in-loop by design)
- Optimize for: Safety over autonomy
- Scale: Millions of users (can't risk failures)
- Result: Semi-autonomous (requires human decisions)

**Our System:**
- Goal: **Fully autonomous** coding (minimal human intervention)
- Optimize for: Autonomy over cost
- Scale: Small initially (can iterate on safety)
- Result: Truly autonomous (handles edge cases intelligently)

**Different goals require different architectures.**

### 2. The "Specialist" Insight

**User's Key Insight:**
> "A real human specialist would run all these tests and commands by using the dumb working tools. The LLM should BE the specialist, not just call the tools."

**Example: Security Agent**

❌ **WRONG (Dumb Worker):**
```typescript
async function securityAgent() {
  const sarif = await exec("semgrep --sarif");
  return sarif; // Just returns raw output
}
```

✅ **RIGHT (Smart Specialist):**
```typescript
async function securityAgent(code: string) {
  // 1. Decide which tools to run
  const tools = await llm.analyze("Which security tools for this code?");
  
  // 2. Run the tools
  const semgrep = await exec(`semgrep ${tools.semgrepRules}`);
  const trivy = await exec("trivy fs .");
  
  // 3. ANALYZE results (not just return them)
  const analysis = await llm.analyze({
    sarif: semgrep,
    sbom: trivy,
    context: code
  });
  
  // 4. Propose remediations
  return {
    findings: analysis.realIssues, // filtered false positives
    remediations: analysis.fixes,   // actionable fixes
    priority: analysis.severity     // prioritized by impact
  };
}
```

This is how **real security engineers work.**

### 3. Zero-Trust Validator is Critical for Autonomy

**Without Validator:**
- Trust worker reports (risky)
- No independent verification
- Errors cascade through system

**With Zero-Trust Validator:**
- Independently verifies all claims
- Reads actual source files
- Runs own tests/scans
- Catches mistakes before they propagate

**This is why Copilot/Cursor aren't fully autonomous** - they lack independent validation.

### 4. Cost vs Autonomy Trade-Off

**Option A (GPT's "Cheap" Way):**
- LLM costs: ~$0.50/execution
- Human intervention: 5-10 times per execution
- **Total cost:** $0.50 + (10 × human_time) = **HIGH**

**Option B (Our "Expensive" Way):**
- LLM costs: ~$1.90/execution
- Human intervention: 0-1 times per execution (only on escalation)
- **Total cost:** $1.90 + (0.1 × human_time) = **LOWER**

**We save money by eliminating humans from the loop.**

---

## Implementation Tools (Production from Line 1)

| Component | Tool | Why |
|-----------|------|-----|
| **MCA (Smart Coordinator)** | LangGraph JS + Postgres Checkpointer | Stateful LLM supervisor with deterministic rails |
| **Planner** | OpenAI Structured Outputs (JSON Schema) | Deterministic task schemas, reliable parsing |
| **Implementer** | **OpenAI Function Calling (GPT-4o/GPT-5)** | Live streaming edits to Monaco, API-native, uses existing credits |
| **Runner** | E2B Sandbox → Firecracker | VM-level isolation for untrusted code |
| **Validator** | pytest/coverage + LLM judge | Ground truth tools + structured outputs |
| **State** | Postgres (LangGraph checkpointer) | Resume/retry, ACID guarantees |
| **Message Bus** | Redis Streams (→ NATS later) | Simple at small scale, durable |
| **Artifacts** | MinIO (S3-compatible) | Self-hosted object storage |
| **Observability** | OTel → Tempo → Grafana + Langfuse | Traces, metrics, LLM costs |

**Note on Aider CLI:** Originally recommended by RA, but rejected because:
- ❌ CLI tool designed for terminal use
- ❌ Doesn't fit web IDE architecture
- ❌ Can't stream edits to Monaco in real-time
- ✅ **Replacement (Updated 2025-10-21):** OpenAI Function Calling with `edit_file` tool (uses existing OpenAI credits, GPT-5 ready, API-native streaming)

---

## Why We Rejected the Alternative (Dumb Orchestrator)

### Problems with Dumb Orchestrator:

1. **Pre-programmed task sequences** - Can't adapt to context
   - Example: "Build yellow+green TODO app" → generic task list ignores styling requirement

2. **Dumb workers can't make decisions**
   - Security Agent just runs `semgrep` → doesn't analyze results
   - Quality Agent checks `coverage >= 80%` → doesn't review code quality

3. **No intelligence in validation**
   - Workers self-report results → confirmation bias
   - No independent verification → errors propagate

4. **Requires human intervention**
   - Can't handle edge cases
   - Can't recover from failures
   - Semi-autonomous at best

---

## Acceptance Criteria for This Decision

We'll validate this architecture is correct if:

1. ✅ **Vertical Slice #1 completes end-to-end** without human intervention
2. ✅ **Validator catches mistakes** that Implementer made (proves zero-trust works)
3. ✅ **MCA adapts to context** (handles "yellow+green" requirement vs generic TODO)
4. ✅ **Smart specialists analyze results** (not just return raw tool output)
5. ✅ **Cost per execution ≤ $2** (including all LLM calls)
6. ✅ **Human intervention rate < 10%** (autonomy target)

If any of these fail, we'll revisit the architecture empirically (not via LLM research).

---

## Lessons Learned

### About LLM Research:

1. **Never trust primed prompts** - LLMs rationalize any position
2. **Ask neutral questions** - "How was your day?" not "Did you have a good day?"
3. **Verify with empirics** - Build prototypes, measure results
4. **User intuition matters** - Non-technical insights can be more valuable than LLM research

### About Architecture:

1. **Specialists should be intelligent** - Don't reduce engineers to script runners
2. **Validation must be independent** - Zero-trust prevents cascade failures
3. **Different goals = different architectures** - Don't blindly copy industry if goals differ
4. **Production from line 1** - No stubs, no fake evidence, no refactoring debt

---

## Next Steps

1. ✅ **Create Vertical Slice #1 plan** (MCA → Planner → Implementer → Runner → Validator)
2. ✅ **Update governance docs** (CONSTITUTION, AI_INSTRUCTIONS, delivery.md)
3. ✅ **Build infrastructure** (LangGraph, Postgres, Redis, MinIO)
4. ✅ **Implement agents** (starting with MCA + Planner)
5. ✅ **Measure results** (autonomy %, cost, quality)

---

## References

- RA Research Report: `11_211025/umca_research_report_multi_agent_ai_coding_system_oct_2025.md`
- Complete Log: `11_211025/complete_log.md` (Log Slices 5-7)
- GPT Round 1 Research: Dumb orchestrator recommendation (biased toward cost)
- GPT Round 2 Research: Smart MCA recommendation (biased toward autonomy)
- User's Architecture Insight: "Specialists should BE intelligent, not just call tools"

---

**Signed:**
- User (Product Owner) - Approved 2025-10-21
- Claude (Technical Architect) - Approved 2025-10-21

**Constitutional Compliance:**
- ✅ Production from line 1 (no stubs)
- ✅ Evidence-based decision making (RA research + user insight)
- ✅ Vertical slice approach (incremental delivery)
- ✅ No refactoring debt (build it right the first time)
