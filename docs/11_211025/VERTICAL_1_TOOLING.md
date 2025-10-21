# Vertical Slice #1: Production Tool Stack

**Date:** 2025-10-21  
**Status:** APPROVED  
**Based on:** RA Research Report + Architecture Decision

---

## Overview

This document specifies the **production-ready tools** we'll use for Vertical Slice #1, following our "production from line 1" constitutional mandate.

**Vertical Slice #1 Scope:**
```
User Request: "Build a TODO API with tests"
    ↓
Gateway (HTTP POST /executions)
    ↓
MCA (Smart LangGraph Supervisor)
    ↓ routes to Planner
Planner (OpenAI Structured Outputs)
    → Returns: { tasks: [...], acceptance: [...] }
    ↓
MCA routes to Implementer
Implementer (Anthropic Text Editor Tool)
    → Streams edits to VFS
    → Stores artifacts in MinIO
    ↓
MCA routes to Runner
Runner (E2B Sandbox)
    → Executes: npm test
    → Returns: JUnit XML + coverage.json
    ↓
MCA routes to Validator
Validator (pytest + LLM judge with structured outputs)
    → Independently runs tests
    → Verifies coverage ≥ 80%
    → Checks for hardcoded secrets
    → Returns: PASS/FAIL + remediation plan
    ↓
MCA decides next step:
    - PASS → Complete (202 response with artifacts)
    - FAIL → Route back to Implementer with remediation
    - FAIL 3x → Escalate to human
```

---

## Component 1: Smart MCA (Coordinator)

### Tool: LangGraph JS + Postgres Checkpointer

**Why:**
- ✅ **LLM-powered Supervisor node** - Can make routing decisions
- ✅ **Deterministic graph structure** - Predictable state transitions
- ✅ **Postgres checkpointer** - Resume/retry with ACID guarantees
- ✅ **Production-ready** - Used by LangChain in production deployments
- ✅ **TypeScript-native** - Matches our stack

**Dependencies:**
```json
{
  "@langchain/langgraph": "^0.2.0",
  "@langchain/core": "^0.3.0",
  "@langchain/openai": "^0.3.0",
  "pg": "^8.11.0"
}
```

**Minimal Example:**
```typescript
import { StateGraph, START, END } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { ChatOpenAI } from "@langchain/openai";

// Graph state
type State = {
  thread_id: string;
  user_intent: string;
  current_agent: string;
  messages: Array<{ role: string; content: string }>;
  artifacts: Record<string, string>;
};

// MCA Supervisor node (LLM-powered) using OpenAI
const mca = new ChatOpenAI({
  modelName: process.env.OPENAI_MODEL || "gpt-4o-2024-08-06", // or "gpt-5" when available
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
  .addNode("implementer", implementerNode)
  .addNode("runner", runnerNode)
  .addNode("validator", validatorNode)
  .addEdge(START, "supervisor")
  .addConditionalEdges("supervisor", (s) => s.current_agent)
  .compile({ checkpointer });

// Run with state persistence
const result = await graph.invoke(
  { thread_id: "exec-123", user_intent: "Build TODO API" },
  { configurable: { thread_id: "exec-123" } }
);
```

**Production Notes:**
- Use Postgres checkpointer for production (not SQLite)
- Set up connection pooling (pg.Pool)
- Configure checkpoint retention policy
- Enable OpenTelemetry spans for each node

---

## Component 2: Planner (Task Decomposition)

### Tool: OpenAI Structured Outputs (JSON Schema)

**Why:**
- ✅ **Deterministic schemas** - Guarantees valid JSON every time
- ✅ **Type safety** - Direct TypeScript type generation from schema
- ✅ **Production-ready** - OpenAI's recommended approach for structured data
- ✅ **Cost-effective** - Single LLM call per plan

**Dependencies:**
```json
{
  "openai": "^4.67.0",
  "zod": "^3.23.0"
}
```

**Minimal Example:**
```typescript
import OpenAI from "openai";
import { z } from "zod";

const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  command: z.string().optional(),
  dependsOn: z.array(z.string()).optional()
});

const PlanSchema = z.object({
  tasks: z.array(TaskSchema).min(2).max(10),
  acceptance_criteria: z.array(z.string())
});

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function plannerAgent(userIntent: string) {
  const response = await client.chat.completions.create({
    model: "gpt-4o-2024-08-06",
    messages: [
      {
        role: "system",
        content: "You are a task planner. Break user requests into 2-10 concrete tasks."
      },
      { role: "user", content: userIntent }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "Plan",
        schema: PlanSchema,
        strict: true
      }
    }
  });
  
  const plan = PlanSchema.parse(JSON.parse(response.choices[0].message.content));
  return plan;
}
```

**Production Notes:**
- Validate with Zod before returning
- Store plan.json in MinIO with execution ID
- Include topological sort for `dependsOn` validation
- Add retry logic (3x) for schema violations

---

## Component 3: Implementer (Code Generation)

### Tool: OpenAI Function Calling (GPT-4o / GPT-5)

**Why:**
- ✅ **Uses your existing OpenAI credits** - No Anthropic dependency
- ✅ **GPT-5 ready** - Can swap to GPT-5 when available
- ✅ **API-native streaming** - Pure TypeScript integration
- ✅ **Multi-vendor portability** - Can add Anthropic/Gemini later (5/5 portability)
- ✅ **Virtual FS compatible** - You control where edits apply
- ✅ **Real-time UX** - Stream function calls to Monaco as they're generated

**Dependencies:**
```json
{
  "openai": "^4.67.0"
}
```

**Minimal Example:**
```typescript
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Virtual file system (replace with your storage)
const vfs = new Map<string, string>();
vfs.set("src/app.ts", "export const add = (a, b) => a + b;\n");

// Define edit_file function for OpenAI
const tools: OpenAI.ChatCompletionTool[] = [{
  type: "function",
  function: {
    name: "edit_file",
    description: "Edit a file using string replacement, creation, insertion, or viewing",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path relative to project root" },
        operation: { 
          type: "string", 
          enum: ["view", "create", "str_replace", "insert"],
          description: "Operation to perform on the file"
        },
        old_str: { 
          type: "string", 
          description: "Exact string to replace (required for str_replace)" 
        },
        new_str: { 
          type: "string", 
          description: "Replacement string (required for str_replace, insert)" 
        },
        file_content: { 
          type: "string", 
          description: "Complete file content (required for create)" 
        },
        insert_line: { 
          type: "number", 
          description: "Line number to insert at (required for insert)" 
        }
      },
      required: ["path", "operation"]
    }
  }
}];

export async function implementerAgent(task: Task) {
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: "You are a code implementer. Use edit_file to view, create, and modify files. Always view files before editing."
    },
    {
      role: "user",
      content: `Implement this task: ${task.description}\n\nAvailable files:\n${Array.from(vfs.keys()).join("\n")}`
    }
  ];

  const stream = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-2024-08-06", // or "gpt-5" when available
    messages,
    tools,
    stream: true
  });

  let currentToolCall: any = null;
  
  // Handle streaming tool calls
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;
    
    // Start of new tool call
    if (delta?.tool_calls?.[0]) {
      const tc = delta.tool_calls[0];
      
      if (tc.id) {
        currentToolCall = { id: tc.id, name: tc.function?.name, arguments: "" };
      }
      
      if (tc.function?.arguments) {
        currentToolCall.arguments += tc.function.arguments;
        
        // Stream partial parameters for live UI updates
        try {
          const partial = JSON.parse(currentToolCall.arguments);
          publishEvent("edit.streaming", {
            path: partial.path,
            operation: partial.operation,
            partial_text: partial.new_str || partial.file_content
          });
        } catch {
          // Incomplete JSON, continue streaming
        }
      }
    }
    
    // Tool call complete
    if (delta?.finish_reason === "tool_calls" && currentToolCall) {
      const args = JSON.parse(currentToolCall.arguments);
      await handleToolCall(currentToolCall.name, args, vfs);
      currentToolCall = null;
    }
  }
  
  return { status: "complete", files: Array.from(vfs.keys()) };
}

async function handleToolCall(name: string, args: any, vfs: Map<string, string>) {
  if (name !== "edit_file") return;
  
  const { path, operation, old_str, new_str, file_content, insert_line } = args;
  
  switch (operation) {
    case "view":
      const content = vfs.get(path) ?? "";
      return content; // Return for LLM context
      
    case "create":
      vfs.set(path, file_content ?? "");
      await uploadArtifact(path, file_content);
      publishEvent("edit.complete", { path, operation: "create" });
      break;
      
    case "str_replace":
      const current = vfs.get(path) ?? "";
      const updated = current.replace(old_str, new_str);
      vfs.set(path, updated);
      await uploadArtifact(path, updated);
      publishEvent("edit.complete", { path, operation: "str_replace", old_str, new_str });
      break;
      
    case "insert":
      const lines = (vfs.get(path) ?? "").split("\n");
      lines.splice(insert_line, 0, new_str);
      const inserted = lines.join("\n");
      vfs.set(path, inserted);
      await uploadArtifact(path, inserted);
      publishEvent("edit.complete", { path, operation: "insert", insert_line, new_str });
      break;
  }
}
```

**Production Notes:**
- Execute edits against your VFS (memory, MinIO, Postgres)
- Never apply edits directly to disk without validation
- Store all edit deltas in MinIO for audit trail
- Implement rollback mechanism (shadow buffers)
- Add syntax validation before accepting edits

**Frontend Integration (Monaco):**
```typescript
// Frontend receives SSE events from Gateway
const eventSource = new EventSource(`/api/execution/${execId}/stream`);

eventSource.addEventListener("edit.streaming", (e) => {
  const { path, partial_text } = JSON.parse(e.data);
  
  // Show "ghost text" in Monaco as it streams
  const model = monaco.editor.getModel(monaco.Uri.file(path));
  if (model) {
    // Add decoration showing partial edit
    showGhostText(model, partial_text);
  }
});

eventSource.addEventListener("edit.complete", (e) => {
  const { path, old_str, new_str } = JSON.parse(e.data);
  
  // Apply actual edit with accept/reject UI
  applyDiffWithReview(path, old_str, new_str);
});
```

---

## Component 4: Runner (Test Execution)

### Tool: E2B Sandbox (pilot) → Firecracker (production)

**Why E2B for Pilot:**
- ✅ **VM-level isolation** - True security boundary
- ✅ **Managed service** - No ops overhead initially
- ✅ **Fast setup** - Running in minutes, not days
- ✅ **Production-ready** - Used by coding agents in production

**Why Firecracker for Later:**
- ✅ **Self-hosted** - No vendor dependency
- ✅ **Lower cost** - After scale justifies ops investment
- ✅ **AWS-grade security** - Powers Lambda

**Dependencies:**
```json
{
  "@e2b/sdk": "^1.0.0"
}
```

**Minimal Example (E2B):**
```typescript
import { Sandbox } from "@e2b/sdk";

export async function runnerAgent(files: Map<string, string>) {
  // Create isolated sandbox
  const sandbox = await Sandbox.create({ template: "node-20" });
  
  try {
    // Write files to sandbox
    for (const [path, content] of files.entries()) {
      await sandbox.files.write(path, content);
    }
    
    // Install dependencies
    await sandbox.commands.run("npm install", { timeoutMs: 60_000 });
    
    // Run tests
    const testResult = await sandbox.commands.run(
      "npm test -- --reporter=json --coverage",
      { timeoutMs: 120_000 }
    );
    
    // Parse results
    const junit = parseJUnit(testResult.stdout);
    const coverage = parseCoverage(await sandbox.files.read("coverage/coverage-final.json"));
    
    // Upload artifacts
    await uploadArtifact("junit.xml", junit);
    await uploadArtifact("coverage.json", coverage);
    
    return {
      passed: testResult.exitCode === 0,
      junit,
      coverage
    };
  } finally {
    await sandbox.close();
  }
}
```

**Production Notes:**
- Set resource limits (CPU, memory, time)
- Disable network by default (enable only for npm/pip with mirrors)
- Capture stdout/stderr for debugging
- Clean up sandbox on failure
- Add circuit breaker for sandbox creation failures

**Migration Path to Firecracker:**
```typescript
// Future self-hosted implementation
export async function runnerAgentFirecracker(files: Map<string, string>) {
  // 1. Provision KVM-enabled VPS
  // 2. Build rootfs with Node.js + npm
  // 3. Run firecracker with jailer
  // 4. Mount ephemeral volume with files
  // 5. Execute tests via FIFO API
  // 6. Stream stdout/stderr
  // 7. Enforce CPU/mem/time limits via cgroups
  // 8. Destroy VM after run
}
```

---

## Component 5: Validator (Independent Verification)

### Tool: pytest/coverage + LLM Judge (Structured Outputs)

**Why:**
- ✅ **Ground truth first** - Real tools, not LLM hallucinations
- ✅ **LLM for analysis only** - Interpret results, propose fixes
- ✅ **Structured outputs** - Binary pass/fail with remediation plan
- ✅ **Zero-trust** - Re-runs tests independently

**Dependencies:**
```json
{
  "openai": "^4.67.0",
  "zod": "^3.23.0"
}
```

**Minimal Example:**
```typescript
import { execSync } from "node:child_process";
import OpenAI from "openai";
import { z } from "zod";

const ValidationSchema = z.object({
  verdict: z.enum(["PASS", "FAIL"]),
  reason: z.string(),
  issues: z.array(z.object({
    type: z.string(),
    severity: z.enum(["critical", "high", "medium", "low"]),
    description: z.string(),
    remediation: z.string()
  })),
  cost: z.number() // LLM token cost for FinOps
});

export async function validatorAgent(taskId: string, implementerReport: any) {
  // 1. Read task from MCA
  const task = await getTask(taskId);
  
  // 2. Read implementer's report (don't trust it)
  const implClaims = implementerReport;
  
  // 3. Independently run tests (ground truth)
  let testResult;
  try {
    execSync("npm test -- --reporter=json --coverage", { timeout: 60_000 });
    testResult = { passed: true, coverage: parseCoverage() };
  } catch (e) {
    testResult = { passed: false, error: e.stdout?.toString() };
  }
  
  // 4. Check for hardcoded secrets
  const secrets = await scanForSecrets(); // regex/tool
  
  // 5. Verify coverage threshold
  const coveragePassed = testResult.coverage?.total >= 80;
  
  // 6. LLM analysis (ONLY if automated checks ambiguous)
  let llmAnalysis = null;
  if (!testResult.passed || !coveragePassed || secrets.length > 0) {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    const response = await client.chat.completions.create({
      model: "gpt-4o-2024-08-06",
      messages: [{
        role: "system",
        content: "You are a zero-trust validator. Analyze test failures and propose fixes."
      }, {
        role: "user",
        content: JSON.stringify({
          task,
          implementer_claims: implClaims,
          test_result: testResult,
          secrets_found: secrets,
          coverage: testResult.coverage
        })
      }],
      response_format: {
        type: "json_schema",
        json_schema: { name: "Validation", schema: ValidationSchema, strict: true }
      }
    });
    
    llmAnalysis = ValidationSchema.parse(JSON.parse(response.choices[0].message.content));
  }
  
  // 7. Return verdict
  const verdict = testResult.passed && coveragePassed && secrets.length === 0
    ? "PASS"
    : "FAIL";
  
  return {
    verdict,
    automated_checks: {
      tests_passed: testResult.passed,
      coverage_passed: coveragePassed,
      secrets_found: secrets.length
    },
    llm_analysis: llmAnalysis,
    artifacts: {
      junit_url: await uploadArtifact("validator-junit.xml", testResult),
      coverage_url: await uploadArtifact("validator-coverage.json", testResult.coverage)
    }
  };
}
```

**Production Notes:**
- Always run ground truth tools first (tests, coverage, linters)
- Use LLM judge ONLY for tie-breaks or ambiguous failures
- Cap LLM analysis cost (<$0.05 per validation)
- Store all validation artifacts in MinIO
- Include RFC 9457 Problem Details in FAIL responses

---

## Component 6: Infrastructure

### State Management: Postgres (LangGraph Checkpointer)

**Schema:**
```sql
CREATE TABLE checkpoints (
  thread_id TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  checkpoint_id TEXT NOT NULL,
  parent_checkpoint_id TEXT,
  checkpoint JSONB NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
);

CREATE INDEX idx_checkpoints_parent ON checkpoints (parent_checkpoint_id);
```

**Why:** ACID guarantees, resume/retry, LangGraph native support

---

### Message Bus: Redis Streams (→ NATS JetStream later)

**Why Redis First:**
- ✅ Simple at small scale (1-5 concurrent executions)
- ✅ Already using Redis for caching
- ✅ Built-in persistence
- ✅ Easy consumer groups

**Example:**
```typescript
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL);

// Publish agent message
await redis.xadd(
  "agent:tasks",
  "*",
  "agent", "implementer",
  "task_id", "task-123",
  "payload", JSON.stringify(task)
);

// Subscribe to agent messages
const consumer = await redis.xreadgroup(
  "GROUP", "implementer-group", "consumer-1",
  "STREAMS", "agent:tasks", ">"
);
```

**Migration to NATS:**
- When: 10+ concurrent executions
- Why: Better scalability, request/reply patterns
- Effort: ~2-3 days (swap Redis client for NATS)

---

### Artifact Storage: MinIO (S3-compatible)

**Why:**
- ✅ Self-hosted (no vendor lock)
- ✅ S3 API (can swap to AWS later)
- ✅ Versioning support
- ✅ Low ops overhead

**Setup:**
```yaml
# docker-compose.yml
minio:
  image: minio/minio:latest
  command: server /data --console-address ":9001"
  environment:
    MINIO_ROOT_USER: minioadmin
    MINIO_ROOT_PASSWORD: minioadmin123
  ports:
    - "9000:9000"
    - "9001:9001"
  volumes:
    - minio-data:/data
```

**Client:**
```typescript
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY,
    secretAccessKey: process.env.MINIO_SECRET_KEY
  },
  forcePathStyle: true
});

export async function uploadArtifact(key: string, content: string) {
  await s3.send(new PutObjectCommand({
    Bucket: "umca-artifacts",
    Key: key,
    Body: content,
    ContentType: "application/json"
  }));
  
  return `${process.env.MINIO_ENDPOINT}/umca-artifacts/${key}`;
}
```

---

### Observability: OpenTelemetry + Tempo + Grafana + Langfuse

**Why:**
- ✅ **OTel** - Industry standard for traces
- ✅ **Tempo** - Self-hosted trace storage
- ✅ **Grafana** - Visualization
- ✅ **Langfuse** - LLM-specific tracing + costs

**Setup:**
```typescript
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  }),
  instrumentations: [getNodeAutoInstrumentations()]
});

sdk.start();
```

**Langfuse Integration:**
```typescript
import { Langfuse } from "langfuse";

const langfuse = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY
});

// Wrap LLM calls
const trace = langfuse.trace({ name: "planner-execution" });
const response = await client.chat.completions.create({ /* ... */ });
trace.generation({
  model: "gpt-4o",
  input: messages,
  output: response.choices[0].message.content,
  usage: response.usage
});
await langfuse.flush();
```

---

## Budget Breakdown (OpenAI-Only Stack)

| Component | Monthly Cost (1-5 concurrent) |
|-----------|------------------------------|
| **LLM APIs (OpenAI only)** | $400-800 |
| - GPT-4o MCA (routing) | $100-200 |
| - GPT-4o Planner (decomposition) | $100-200 |
| - GPT-4o Implementer (code gen) | $150-300 |
| - GPT-4o Validator (analysis) | $50-100 |
| **E2B Sandbox** | $100-200 |
| **Infrastructure** | $200-300 |
| - VPS (Hetzner/DO) | $100 |
| - MinIO storage | $50 |
| - Redis | $50 |
| - Misc (domains, SSL) | $50 |
| **Observability** | $0-100 |
| - Langfuse (free tier) | $0 |
| - Self-hosted Tempo/Grafana | $0 |
| **Total** | **$700-1400/month** |

**GPT-4o Pricing (as of 2024):**
- Input: $2.50 / 1M tokens
- Output: $10.00 / 1M tokens
- **~20-40% cheaper than mixed OpenAI+Anthropic stack**

**Scaling to 100 concurrent:**
- LLM (OpenAI): ~$4k-7k/month
- Infrastructure: ~$1k-2k/month
- Total: **$5k-9k/month**

**When GPT-5 available:**
- Pricing TBD (estimated $5-15/1M tokens input)
- Budget may increase to $600-1200/month initially
- Performance gains likely justify cost

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| **OpenAI API outage** | Multi-vendor escape hatch: Add Anthropic Text Editor Tool or Gemini function calling (see Multi-Vendor section below) |
| **E2B rate limits** | Circuit breaker + queue depth monitoring |
| **LLM cost runaway** | Per-execution budget caps ($2 max) + circuit breaker |
| **Postgres connection exhaustion** | Connection pooling (pg.Pool) + max 50 connections |
| **MinIO disk full** | Lifecycle policies (delete artifacts >30 days old) |
| **Redis memory limit** | Max stream length (10k messages) + TTL on keys |
| **GPT-5 pricing uncertainty** | Budget alerts at $1.50/execution threshold; stay on GPT-4o if GPT-5 > 2x cost |

---

## Multi-Vendor Escape Hatch

**Current Architecture:** OpenAI-only (uses your existing credits, GPT-5 ready)

**If OpenAI experiences outage or quality regression, add these alternatives:**

### Anthropic Text Editor Tool (Backup for Implementer)
```typescript
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Use text_editor_20250728 tool with same VFS pattern
// Streaming is slightly better (5/5 vs OpenAI 4/5)
// See original VERTICAL_1_TOOLING.md for full code
```

**When to use:**
- OpenAI function calling quality degrades
- Need finest-grained streaming for complex refactors
- Want to A/B test code quality

### Google Gemini (Future Option)
```typescript
import { GoogleGenerativeAI } from "@google/generative-ai";

// Similar function calling approach
// Pro: Competitive pricing, good code generation
// Con: Newer API, less battle-tested for agents
```

**Migration Effort:**
- **1-2 days** to add Anthropic as backup (wrap in same `implementerAgent` interface)
- **2-3 days** to add Gemini (requires new function schema mapping)

**Cost Comparison:**
- OpenAI GPT-4o: $2.50 input / $10 output per 1M tokens
- Anthropic Claude Sonnet 4.5: $3 input / $15 output per 1M tokens
- Google Gemini 1.5 Pro: $1.25 input / $5 output per 1M tokens

**Architecture Decision:** Start OpenAI-only (your credits, simpler stack), add multi-vendor if needed later. Multi-vendor portability score: **5/5** (clean abstraction at `implementerAgent` boundary).

---

## Next Steps

1. ✅ **Week 1:** Set up infrastructure (Postgres, Redis, MinIO, OTel)
2. ✅ **Week 2:** Implement MCA + Planner (LangGraph + OpenAI Structured Outputs)
3. ✅ **Week 3-4:** Implement Implementer (OpenAI Function Calling with edit_file)
4. ✅ **Week 5-6:** Implement Runner (E2B) + Validator
5. ✅ **Week 7-8:** End-to-end testing + remediation loops

---

## References

- RA Research Report: `docs/11_211025/umca_research_report_multi_agent_ai_coding_system_oct_2025.md`
- Architecture Decision: `ARCHITECTURE_DECISION.md`
- LangGraph Docs: https://langchain-ai.github.io/langgraph/
- OpenAI Function Calling: https://platform.openai.com/docs/guides/function-calling
- OpenAI Structured Outputs: https://platform.openai.com/docs/guides/structured-outputs
- E2B Docs: https://e2b.dev/docs
- Multi-vendor comparison: See "Multi-Vendor Escape Hatch" section above
