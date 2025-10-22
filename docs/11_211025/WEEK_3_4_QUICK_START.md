# Week 3-4 Quick Start Guide

**Goal:** Implementer Agent + VFS → Code Generation with SSE Streaming

**Duration:** 10 days | **Status:** READY TO BUILD

---

## 🚀 What You're Building

**Before Week 3:**
```
User → Gateway → MCA → Planner → [plan.json in MinIO]
```

**After Week 3-4:**
```
User → Gateway → MCA → Planner → Implementer → [code files in MinIO]
                              ↓
                         SSE stream (live edit events)
```

---

## 📦 New Packages to Create

1. **packages/vfs** - Virtual File System library
   - MinIO-backed implementation (for all environments)
   - Versioning support (shadow copies)

2. **packages/implementer** - Code generation service
   - OpenAI Function Calling with tools
   - VFS integration
   - Redis event publishing (for SSE)
   - Langfuse tracing

---

## 🔧 OpenAI Function Calling Tools

You'll implement these 4 tools:

```typescript
// Tool 1: View file contents
{
  type: 'function',
  function: {
    name: 'view',
    description: 'Read contents of a file',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to project root' }
      },
      required: ['path']
    }
  }
}

// Tool 2: Create new file
{
  type: 'function',
  function: {
    name: 'create',
    description: 'Create a new file with content',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' }
      },
      required: ['path', 'content']
    }
  }
}

// Tool 3: Replace text in file
{
  type: 'function',
  function: {
    name: 'str_replace',
    description: 'Replace exact string match in file',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        old_str: { type: 'string', description: 'Exact string to find' },
        new_str: { type: 'string', description: 'Replacement string' }
      },
      required: ['path', 'old_str', 'new_str']
    }
  }
}

// Tool 4: Insert text at line number
{
  type: 'function',
  function: {
    name: 'insert',
    description: 'Insert text at specific line number',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        line: { type: 'number', description: '1-indexed line number' },
        content: { type: 'string' }
      },
      required: ['path', 'line', 'content']
    }
  }
}
```

---

## 📝 Implementation Checklist (15 Tasks)

### Phase 1: VFS (Days 1-2) ✅

- [ ] Create `packages/vfs/package.json`
- [ ] Create `packages/vfs/src/interface.ts` - Define VFS interface
- [ ] Create `packages/vfs/src/minio.ts` - MinIO-backed with versioning
- [ ] Create `packages/vfs/src/__tests__/vfs.test.ts` - Tests (MinIO with unique prefixes)
- [ ] Add to `packages/shared/src/vfs.ts` - Export factory

### Phase 2: Implementer Service (Days 3-6) 🔨

- [ ] Create `packages/implementer/package.json`
- [ ] Create `packages/implementer/src/server.ts` - Express server (port 7030)
- [ ] Create `packages/implementer/src/agent.ts` - OpenAI Function Calling logic
- [ ] Create `packages/implementer/src/tools.ts` - Tool definitions + execution
- [ ] Create `packages/implementer/src/publisher.ts` - Redis event publishing
- [ ] Create `packages/implementer/src/__tests__/agent.test.ts` - Mock OpenAI tests
- [ ] Add Langfuse tracing for token usage

### Phase 3: Integration (Days 7-10) 🔗

- [ ] Update `packages/mca/src/server.ts` - Add implementer node
- [ ] Update `packages/gateway/src/server.ts` - Enhance SSE for edit events
- [ ] Create `.automation/evidence/week3/collect_evidence.sh` - Gate validation
- [ ] Test end-to-end: Gateway → Planner → Implementer → code in MinIO
- [ ] Verify SSE streaming shows live edits
- [ ] Run all gates, iterate to PASS

---

## 🎯 Acceptance Criteria (6 Gates)

| Gate | Test | PASS Criteria |
|------|------|---------------|
| **G1-VFS** | `npm test packages/vfs` | VFS tests pass, MinIO persistence works |
| **G2-IMPLEMENTER** | `curl localhost:7030/implement` | Code generated, stored in MinIO, syntax valid |
| **G3-SSE** | `curl localhost:3030/api/executions/:id/stream` | Edit events streamed in real-time |
| **G4-MCA** | `POST /executions` → status=implemented | MCA routes Planner → Implementer correctly |
| **G5-TRACE** | Grafana UI | Implementer span visible in traces |
| **G6-QUALITY** | `npm run lint && npm test` | Lint ✅ Types ✅ Tests ✅ Coverage ≥80% ✅ |

---

## 🔑 Key Technical Decisions

### 1. OpenAI Function Calling (Not Anthropic)
**Why:** You have OpenAI credits, deferring multi-vendor to V2

**Example:**
```typescript
import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const response = await client.chat.completions.create({
  model: 'gpt-4o-2024-08-06',
  messages: [
    { role: 'system', content: 'You are a code generator...' },
    { role: 'user', content: `Generate code for: ${task.description}` }
  ],
  tools: [viewTool, createTool, strReplaceTool, insertTool],
  tool_choice: 'auto'
});

// Handle tool calls
for (const toolCall of response.choices[0].message.tool_calls || []) {
  const result = await executeToolCall(toolCall, vfs);
  // Publish to Redis for SSE
  await publishEditEvent(execId, { type: 'tool_call', tool: toolCall.function.name, args: toolCall.function.arguments });
}
```

### 2. VFS Versioning Strategy
**Shadow Copies:** Before each edit, copy current file to `{execId}/code/versions/{timestamp}/`

**Why:** Enables rollback without complex git integration

**Example:**
```typescript
async function createShadowCopy(execId: string, path: string, content: string) {
  const timestamp = Date.now();
  const versionPath = `${execId}/code/versions/${timestamp}/${path}`;
  await minio.putObject(ARTIFACT_BUCKET, versionPath, Buffer.from(content));
}
```

### 3. SSE Event Schema
**Events to Publish:**
```typescript
// When edit starts
{ event: 'edit.start', data: { execId, task_id, timestamp } }

// For each tool call
{ event: 'tool_call', data: { tool: 'create', args: { path: 'src/app.ts', content: '...' } } }

// When edit completes
{ event: 'edit.complete', data: { execId, files: ['src/app.ts'], duration_ms: 1234 } }
```

---

## 🚨 Common Pitfalls to Avoid

### ❌ DON'T: Mock OpenAI in production code
```typescript
// WRONG - coupling to OpenAI in every function
if (process.env.NODE_ENV === 'test') {
  return mockOpenAI();
}
```

### ✅ DO: Inject OpenAI client via dependency injection
```typescript
// RIGHT - testable without environment checks
export async function implementerAgent(client: OpenAI, task: Task, vfs: VFS) {
  const response = await client.chat.completions.create({ ... });
  // ...
}
```

### ❌ DON'T: Write VFS writes without validation
```typescript
// WRONG - no syntax check
await vfs.create('src/app.ts', generatedCode);
```

### ✅ DO: Validate TypeScript syntax before storing
```typescript
// RIGHT - validate first
import ts from 'typescript';
const result = ts.transpileModule(generatedCode, { compilerOptions: { noEmit: true } });
if (result.diagnostics?.length > 0) {
  throw new Error('Syntax errors in generated code');
}
await vfs.create('src/app.ts', generatedCode);
```

### ❌ DON'T: Hardcode file paths
```typescript
// WRONG
await vfs.create('src/app.ts', code);
```

### ✅ DO: Extract paths from task description or use conventions
```typescript
// RIGHT
const mainFile = task.files?.main || 'src/app.ts';
const testFile = task.files?.test || 'src/app.test.ts';
await vfs.create(mainFile, code);
```

---

## 📚 References

- **Full DoD:** [WEEK_3_4_DOD.md](WEEK_3_4_DOD.md)
- **Architecture:** [VERTICAL_1_PLAN.md](VERTICAL_1_PLAN.md) (Week 3-4 section)
- **Tool Stack:** [VERTICAL_1_TOOLING.md](VERTICAL_1_TOOLING.md)
- **Rules:** [AGENTS.md](../../AGENTS.md)
- **Constitution:** [CONSTITUTION.md](../../CONSTITUTION.md)

---

## 🎬 Ready to Start?

1. Read [WEEK_3_4_DOD.md](WEEK_3_4_DOD.md) in full
2. Create `packages/vfs` skeleton
3. Implement MinIO-backed VFS (tests use unique prefixes in MinIO)
4. Create `packages/implementer` skeleton
5. Implement OpenAI Function Calling logic
6. Wire to MCA
7. Test end-to-end
8. Iterate to all gates PASS

**Let's ship Week 3-4!** 🚀
