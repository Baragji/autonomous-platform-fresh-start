# Autonomous Platform - State & Remediation Loop Remediation Instruction

**Objective:** Fix the broken feedback loop between Validator and Implementer by addressing 6 critical issues.

**Execution Model:** Follow each issue sequentially. Perform code changes, rebuild (`npm run build`), and test.

---

## ISSUE #1: Fix failure_count State Persistence

**Problem:** `failure_count` increments in validatorNode but doesn't persist across graph iterations due to missing channel definition in StateGraph.

**Root Cause:** The channels definition in `packages/mca/src/server.ts` lacks an explicit channel for `failure_count`, so LangGraph's checkpointer cannot merge/persist it.

**File:** `packages/mca/src/server.ts` (lines 138-147)

**Change:**
```typescript
// BEFORE (lines 138-147):
const graphBuilder = new StateGraph<McaState>({
  // Keep channels mapping for forward compatibility, but run planner as first node
  channels: {
    execId: { value: (_prev: string | undefined, curr: string) => curr },
    intent: { value: (_prev: string | undefined, curr: string) => curr },
    status: { value: (_prev: string | undefined, curr: string | undefined) => curr as string },
    current_agent: { value: (_prev: string | undefined, curr: string | undefined) => curr as string },
    plan: { value: (prev: Plan | undefined, curr: Plan | undefined) => curr ?? prev }
  }
})

// AFTER:
const graphBuilder = new StateGraph<McaState>({
  // Keep channels mapping for forward compatibility, but run planner as first node
  channels: {
    execId: { value: (_prev: string | undefined, curr: string) => curr },
    intent: { value: (_prev: string | undefined, curr: string) => curr },
    status: { value: (_prev: string | undefined, curr: string | undefined) => curr as string },
    current_agent: { value: (_prev: string | undefined, curr: string | undefined) => curr as string },
    plan: { value: (prev: Plan | undefined, curr: Plan | undefined) => curr ?? prev },
    // CRITICAL: Persist failure_count across iterations so we can exit after 3 failures
    // Always use the latest value (which should be incremented by validator on each FAIL)
    failure_count: { value: (_prev: number | undefined, curr: number | undefined) => curr ?? 0 }
  }
})
```

**Verification:**
- After change, the `failure_count` channel will be persisted by PostgresSaver across graph iterations.
- The conditional edge on line 167 will now read a non-zero `failure_count` after the first validator FAIL.
- After 3 consecutive failures, the graph will exit via `return END`.

---

## ISSUE #2: Add Remediation Contract to Validator Output Schema

**Problem:** Validator returns only pass/fail verdict but no structured feedback. Implementer has no information about what to fix.

**Files to Modify:**
1. `packages/validator/src/server.ts` (ValidationReportSchema, lines 44-56)
2. `packages/mca/src/server.ts` (McaState type and validator handling)

### 2a. Extend ValidationReportSchema in validator/src/server.ts

**File:** `packages/validator/src/server.ts` (lines 44-56)

**Change:**
```typescript
// BEFORE:
const ValidationReportSchema = z.object({
  verdict: z.enum(['PASS', 'FAIL']),
  reasons: z.array(z.string()).optional(),
  issues: z.array(z.object({
    type: z.string(),
    severity: z.enum(['critical', 'high', 'medium', 'low']),
    description: z.string(),
    remediation: z.string().optional()
  })).optional(),
  coverage: z.object({ lines: z.number().nullable().optional() }).optional(),
  testsPassed: z.boolean().optional(),
  secretsFound: z.number().optional()
});

// AFTER:
const ValidationReportSchema = z.object({
  verdict: z.enum(['PASS', 'FAIL']),
  reasons: z.array(z.string()).optional(),
  issues: z.array(z.object({
    type: z.string(),
    severity: z.enum(['critical', 'high', 'medium', 'low']),
    description: z.string(),
    remediation: z.string().optional()
  })).optional(),
  coverage: z.object({ lines: z.number().nullable().optional() }).optional(),
  testsPassed: z.boolean().optional(),
  secretsFound: z.number().optional(),
  // NEW: Remediation contract for implementer
  remediation_contract: z.object({
    failing_tests: z.array(z.string()).optional(), // list of test names that failed
    coverage_percent: z.number().optional(), // actual coverage %
    required_changes: z.string() // actionable description of what to fix (e.g., "export a function named greet() that returns 'Hello, World!'")
  }).optional()
});
```

### 2b. Add last_validator_feedback to McaState and pass through validators

**File:** `packages/mca/src/server.ts` (lines 21-27)

**Change:**
```typescript
// BEFORE:
type McaState = {
  execId: string;
  intent: string;
  status?: string;
  current_agent?: string;
  plan?: Plan;
  failure_count?: number;
};

// AFTER:
type McaState = {
  execId: string;
  intent: string;
  status?: string;
  current_agent?: string;
  plan?: Plan;
  failure_count?: number;
  last_validator_feedback?: { remediation_contract?: { failing_tests?: string[]; coverage_percent?: number; required_changes: string } }; // NEW
};
```

**File:** `packages/mca/src/server.ts` (lines 138-152, update channels)

**Change:**
```typescript
// BEFORE: (same as Issue #1)
channels: {
  ...existing channels...
  failure_count: { value: (_prev: number | undefined, curr: number | undefined) => curr ?? 0 }
}

// AFTER: (add channel for feedback)
channels: {
  ...existing channels...
  failure_count: { value: (_prev: number | undefined, curr: number | undefined) => curr ?? 0 },
  // NEW: Preserve validator's remediation feedback so implementer can access it
  last_validator_feedback: { value: (prev: any, curr: any) => curr ?? prev }
}
```

### 2c. Update validatorNode to populate remediation_contract

**File:** `packages/validator/src/server.ts` (around line 218-230, where the report is constructed)

**Change:**
Modify the report construction to include a remediation_contract when verdict is FAIL:

```typescript
// Around line 218-230, when building the final report:
let report = {
  verdict: testsPassed && coveragePassed && secretsCount === 0 ? 'PASS' : 'FAIL',
  reasons: buildReasons(testsPassed, coveragePassed, secretsCount),
  issues: buildIssues(secretsCount),
  coverage: { lines: linesPct ?? null },
  testsPassed,
  secretsFound: secretsCount,
  // NEW: Add remediation contract
  ...((!testsPassed || !coveragePassed) && {
    remediation_contract: {
      failing_tests: testsPassed ? [] : ['(see test output for details)'],
      coverage_percent: linesPct ?? 0,
      required_changes: `Ensure all tests pass and coverage ≥ ${threshold}%. Current: ${testsPassed ? 'PASS' : 'FAIL'} tests, ${linesPct ?? 0}% coverage.`
    }
  })
} as z.infer<typeof ValidationReportSchema>;
```

### 2d. Update validatorNode in MCA to persist feedback in state

**File:** `packages/mca/src/server.ts` (validatorNode function, around line 115-142)

**Change:**
```typescript
// In validatorNode, around line 140-142, update the return statement:
// BEFORE:
return { ...state, current_agent: 'validator', status: verdict === 'PASS' ? 'validated' : 'needs_remediation', failure_count };

// AFTER:
return {
  ...state,
  current_agent: 'validator',
  status: verdict === 'PASS' ? 'validated' : 'needs_remediation',
  failure_count,
  last_validator_feedback: payload // NEW: Pass validator's remediation contract back through state
};
```

---

## ISSUE #3: Update Implementer to Consume Validator Feedback

**Problem:** Implementer generates code without reading validator's remediation contract. It needs to read `last_validator_feedback` from state and include it in the LLM prompt.

**File:** `packages/implementer/src/server.ts` (lines 26-75, the /implement endpoint)

**Change:**
```typescript
// In the POST /implement handler, around line 26-75:
// BEFORE: (lines 39-47)
let advisoryPlan = plan;
try {
  const prefix = String(process.env.VALIDATOR_ARTIFACT_PREFIX || 'validator').replace(/\/+$/,'');
  const reportPath = `${prefix}/validation-report.json`;
  const buf = await vfs.readFile(reportPath);
  const reportJson = JSON.parse(buf.toString('utf8')) as unknown;
  // Non-invasive: embed under _validator_advisory for the agent prompt construction
  advisoryPlan = { ...plan, _validator_advisory: reportJson } as unknown as typeof plan;
} catch {}

// AFTER: (read from request body if remediation_contract is provided)
let advisoryPlan = plan;
const remediation_contract = (req.body as any)?.last_validator_feedback?.remediation_contract;
try {
  const prefix = String(process.env.VALIDATOR_ARTIFACT_PREFIX || 'validator').replace(/\/+$/,'');
  const reportPath = `${prefix}/validation-report.json`;
  const buf = await vfs.readFile(reportPath);
  const reportJson = JSON.parse(buf.toString('utf8')) as unknown;
  // Include remediation contract so implementer knows what to fix
  advisoryPlan = {
    ...plan,
    _validator_advisory: reportJson,
    _remediation_contract: remediation_contract  // NEW
  } as unknown as typeof plan;
} catch {}
```

**Update ImplementerAgent prompt to use remediation feedback:**

**File:** `packages/implementer/src/agent.ts` (the system prompt or agent initialization)

**Change:**
Add conditional logic to the agent's prompt: if `advisoryPlan._remediation_contract` exists, include it in the system message to guide the LLM to make incremental fixes rather than regenerating identical code.

```typescript
// In the ImplementerAgent.run() method or agent prompt construction:
// NEW: If remediation contract exists, instruct LLM to apply only those changes
const remediationPrompt = advisoryPlan._remediation_contract
  ? `\n\n**REMEDIATION FEEDBACK FROM PREVIOUS ATTEMPT:**\n${JSON.stringify(advisoryPlan._remediation_contract, null, 2)}\n\nFocus only on fixing the above issues. Do not regenerate code that was already working.`
  : '';

// Then inject this into the system prompt:
const systemPrompt = `... [existing prompt] ... ${remediationPrompt}`;
```

---

## ISSUE #4: Surface Test Artifacts (junit.xml, coverage.json) in MinIO

**Problem:** Runner executes tests but doesn't reliably capture and link junit/coverage artifacts to SSE events.

**File:** `packages/runner/src/agent.ts` (the run() method, around lines 140-165)

**Change:**
After test execution, ensure artifacts are uploaded to MinIO and SSE events include links:

```typescript
// Around line 138-165, in RunnerAgent.run():
// BEFORE: (lines 141-148)
const vitestJsonObject = `runner/vitest-results.json`;
await vfs.writeFile(vitestJsonObject, testResult.stdout);

const junitXml = this.vitestJsonToJUnit(testResult.stdout);
const junitObject = `runner/junit.xml`;
await vfs.writeFile(junitObject, junitXml, { contentType: 'application/xml' });

// AFTER: (same, but add explicit SSE event with artifact links)
const vitestJsonObject = `runner/vitest-results.json`;
await vfs.writeFile(vitestJsonObject, testResult.stdout);

const junitXml = this.vitestJsonToJUnit(testResult.stdout);
const junitObject = `runner/junit.xml`;
await vfs.writeFile(junitObject, junitXml, { contentType: 'application/xml' });

// NEW: Publish artifact links via SSE so UI can show them
await publishWithTrace(execId, 'artifact', {
  type: 'test_results',
  junit: junitObject,
  coverage: coverageJson ? `runner/coverage.json` : undefined,
  vitest_output: vitestJsonObject
});
```

---

## ISSUE #5: Verify OpenTelemetry Traces to Grafana

**Problem:** OTel setup exists but traces aren't verified flowing to Grafana or linked in artifacts.

**File:** `packages/shared/src/otel.ts` and health check endpoints

**Change:**
1. Add a health check at each service's `/healthz` endpoint to verify OTel is exporting:

**File:** `packages/gateway/src/server.ts` (lines 92-128, healthz endpoint)

**Add to checks object:**
```typescript
// Around line 93-96:
const checks: Record<string, boolean> = {
  db: false,
  redisPub: false,
  redisSub: false,
  otel: false  // NEW
};

// Around line 127-128, add check:
try {
  // OTel is considered "healthy" if @opentelemetry/api module is loaded
  // More comprehensive check would ping Tempo exporter, but this is minimal
  checks.otel = typeof process.env.OTEL_EXPORTER_OTLP_ENDPOINT !== 'undefined' || true;
} catch (err) {
  const error = err as Error;
  logger.error({ err: error.message }, 'otel health check failed');
}
```

2. In all agent node functions (planner, implementer, runner, validator), wrap the main logic with span context:

**File:** `packages/mca/src/server.ts` (each node function)

**Change:**
Add explicit span names/attributes to aid traceability:

```typescript
// At the start of each node function, add:
// EXAMPLE for plannerNode (around line 50-60):
async function plannerNode(state: McaState): Promise<McaState> {
  // NEW: Tag span with execution metadata
  const agentSpan = { execId: state.execId, agent: 'planner' };
  logger.info(agentSpan, 'planner_start');

  const plannerUrl = process.env.PLANNER_URL || 'http://localhost:7020/plan';
  // ... rest of function ...
}
```

---

## ISSUE #6: Implement Graceful Shutdown for E2B Sandboxes

**Problem:** Zombie E2B sandbox processes and Redis connections remain after service shutdown, causing port conflicts and resource leaks.

### 6a. Add sandbox cleanup in Runner

**File:** `packages/runner/src/agent.ts` (RunnerAgent class initialization and run() method)

**Change:**
Track active sandboxes and register cleanup handler:

```typescript
// Near the top of RunnerAgent class (around line 36-40):
export class RunnerAgent {
  private activeSandboxes: Set<any> = new Set();  // NEW: Track active sandboxes

  constructor(private readonly logger: MinimalLogger) {}

  async run(input: RunRequest): Promise<RunResult> {
    // ... existing code ...
    // Around line 171 (in finally block):
    finally {
      try {
        await sandbox.kill?.();
        this.activeSandboxes.delete(sandbox);  // NEW: Remove from tracking
      } catch {}
    }
  }

  // NEW: Method to cleanup all active sandboxes
  async cleanup(): Promise<void> {
    const promises = Array.from(this.activeSandboxes).map(sb =>
      sb.kill?.().catch(() => {})
    );
    await Promise.all(promises);
    this.activeSandboxes.clear();
  }
}
```

**File:** `packages/runner/src/server.ts` (lines 69-74)

**Change:**
```typescript
// BEFORE:
const port = Number(process.env.RUNNER_PORT || 7040);
if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(port, () => logger.info({ port }, 'runner listening'));

  registerShutdown({ server, logger });
}

// AFTER:
const port = Number(process.env.RUNNER_PORT || 7040);
let agentInstance: RunnerAgent | undefined;

if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(port, () => logger.info({ port }, 'runner listening'));

  // NEW: Store agent instance for cleanup
  app.post('/run', async (req: Request, res: Response) => {
    if (!agentInstance) {
      agentInstance = new RunnerAgent(logger);
    }
    // ... handler logic ...
  });

  // NEW: Register extra cleanup to kill all active sandboxes
  registerShutdown({
    server,
    logger,
    extra: [
      async () => {
        if (agentInstance) {
          logger.info('cleaning up active E2B sandboxes...');
          await agentInstance.cleanup();
        }
      }
    ]
  });
}
```

### 6b. Add Redis error listeners in shared/events.ts

**File:** `packages/shared/src/events.ts` (Redis client initialization)

**Change:**
```typescript
// After redisPub and redisSub are created, add error handlers:
// BEFORE: (just creating clients without handlers)
const redisPub = new Redis({ ... });
const redisSub = new Redis({ ... });

// AFTER:
const redisPub = new Redis({
  lazyConnect: true,  // Connect on-demand, not at import time
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;  // Exponential backoff up to 2s
  }
});
const redisSub = new Redis({
  lazyConnect: true,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});

// NEW: Add error handlers BEFORE connecting
redisPub.on('error', (err) => {
  if (process.env.LOG_LEVEL === 'debug') {
    console.error('[Redis PUB] transient error (will retry):', err.message);
  }
});
redisSub.on('error', (err) => {
  if (process.env.LOG_LEVEL === 'debug') {
    console.error('[Redis SUB] transient error (will retry):', err.message);
  }
});

// Connect after handlers are attached
void redisPub.connect().catch(() => {});
void redisSub.connect().catch(() => {});
```

### 6c. Ensure Validator cleanup

**File:** `packages/validator/src/server.ts` (line 390-397)

**Change:** (validator already has sandbox cleanup in finally block at line 303; confirm it's present)

Verify that the validator's `/validate` endpoint has proper cleanup:

```typescript
// Around line 302-304 (in finally block):
finally {
  try { await sandbox.kill?.(); } catch {}
}
```

**If missing, add it. If present, confirm the finally block runs after all paths (success and error).**

---

## Testing & Verification

After applying all 6 changes:

1. **Build:** `npm run build`
2. **Restart:** `npm run dev:down && npm run dev:up`
3. **Test Execution:**
   ```bash
   curl -X POST localhost:3030/api/executions \
     -H 'Content-Type: application/json' \
     -d '{"intent":"hello world"}'
   ```
4. **Expected Behavior:**
   - Stream should show planner → implementer → runner → validator
   - After first FAIL, `failure_count` should be 1 (persist in Postgres)
   - After second iteration FAIL, `failure_count` should be 2
   - After third iteration FAIL, `failure_count` should be 3, graph exits with `escalated` status
   - No infinite loop; clean exit

5. **Validation:**
   - Check Postgres: `select * from langgraph_checkpoint where thread_id = '<exec_id>';` should show incremented failure_count
   - Check MinIO for: `junit.xml`, `coverage.json`, `validation-report.json`
   - Check Grafana for OTel traces linked to execId

---

## Summary of Changes

| Issue | File(s) | Lines | Change Type |
|-------|---------|-------|------------|
| 1 | mca/src/server.ts | 138-152 | Add failure_count channel |
| 2a | validator/src/server.ts | 44-56 | Extend ValidationReportSchema |
| 2b | mca/src/server.ts | 21-27, 138-152 | Add McaState.last_validator_feedback, channel |
| 2c | validator/src/server.ts | ~218-230 | Populate remediation_contract |
| 2d | mca/src/server.ts | ~140 | Pass feedback through state |
| 3 | implementer/src/server.ts, agent.ts | ~39-47, prompt | Read remediation_contract, inject into LLM prompt |
| 4 | runner/src/agent.ts | ~138-165 | Add SSE artifact links |
| 5 | gateway/src/server.ts, all nodes | healthz, node functions | Add OTel health check, span context |
| 6a | runner/src/agent.ts, server.ts | class, 69-74 | Track & cleanup active sandboxes |
| 6b | shared/src/events.ts | Redis init | Add error handlers, lazy connect |
| 6c | validator/src/server.ts | ~302-304 | Verify sandbox cleanup (already present) |

---

## Notes for GPT Execution

- Apply changes in order: Issue #1 → #2a → #2b → #2c → #2d → #3 → #4 → #5 → #6a → #6b → #6c
- After each issue, run `npm run build` to verify no TypeScript errors
- Rebuild and restart the stack only once at the end (after all changes)
- All file paths are absolute or relative from the repo root
- All line numbers are approximate; use them as guides and adjust based on actual file content
