 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/packages/implementer/src/__tests__/agent.unit.test.ts b/packages/implementer/src/__tests__/agent.unit.test.ts
index af52f093702e8cdabdbbcf1cc0cb2289cf6432c0..541b8535f995bc7e76a414a47cec018e192cdfbb 100644
--- a/packages/implementer/src/__tests__/agent.unit.test.ts
+++ b/packages/implementer/src/__tests__/agent.unit.test.ts
@@ -1,26 +1,26 @@
-import { describe, it, expect } from 'vitest';
+import { describe, it, expect, vi } from 'vitest';
 import { ImplementerAgent } from '../agent';
 import { createLogger } from '@autonomous/shared/src/logger';
 import type { Vfs, VfsFileEntry, VfsVersionEntry } from '@autonomous/shared/src/vfs';
 import type { Plan } from '@autonomous/shared/src/plan';
 import type { ChatCompletionResult, ChatCompletionCreateParams } from '../types';
 import type { ImplementerEvent } from '../publisher';
 
 function memoryVfs(initial: Record<string, string> = {}): Vfs {
   const files = new Map<string, Buffer>(Object.entries(initial).map(([k, v]) => [k, Buffer.from(v, 'utf8')]));
   return {
     async writeFile(p: string, content: Buffer | string) {
       files.set(p, typeof content === 'string' ? Buffer.from(content, 'utf8') : content);
     },
     async readFile(p: string) {
       const v = files.get(p);
       if (!v) throw new Error('not found');
       return v;
     },
     async listFiles(): Promise<VfsFileEntry[]> {
       const out: VfsFileEntry[] = [];
       for (const [k, v] of files.entries()) out.push({ path: k, size: v.length, lastModified: new Date() });
       return out;
     },
     async listVersions(_p: string): Promise<VfsVersionEntry[]> { return []; }
   };
@@ -104,26 +104,68 @@ describe('ImplementerAgent (unit)', () => {
         created: Date.now() / 1000,
         model: 'unit', object: 'chat.completion'
       },
       {
         id: 'cmpl-2',
         choices: [ { finish_reason: 'stop', index: 0, logprobs: null, message: { role: 'assistant', content: 'DONE', refusal: null } } ],
         created: Date.now() / 1000,
         model: 'unit', object: 'chat.completion'
       }
     ];
     const openAiStub: { chat: { completions: { create: (p: ChatCompletionCreateParams) => Promise<ChatCompletionResult> } } } = {
       chat: { completions: { create: async () => calls.shift()! } }
     };
     const agent = new ImplementerAgent({
       client: openAiStub,
       vfs: memoryVfs({ 'src/preset.ts': 'preset' }),
       publisher: { publish: async () => {} },
       logger: createLogger('test'),
       model: 'unit'
     });
     const res = await agent.run({ execId: 'exec-2', plan: makePlan() as Plan });
     expect(res.ok).toBe(true);
     // Should fall back to listing files because no touched paths
     expect(res.files.length).toBeGreaterThan(0);
   });
+
+  it('includes validator remediation contract details in the prompt', async () => {
+    const completion: ChatCompletionResult = {
+      id: 'cmpl-feedback',
+      choices: [
+        { finish_reason: 'stop', index: 0, logprobs: null, message: { role: 'assistant', content: 'DONE', refusal: null } }
+      ],
+      created: Date.now() / 1000,
+      model: 'unit',
+      object: 'chat.completion'
+    };
+    const createMock = vi.fn(async (params: ChatCompletionCreateParams) => {
+      return completion;
+    });
+    const openAiStub: { chat: { completions: { create: (p: ChatCompletionCreateParams) => Promise<ChatCompletionResult> } } } = {
+      chat: { completions: { create: createMock } }
+    };
+    const agent = new ImplementerAgent({
+      client: openAiStub,
+      vfs: memoryVfs({ 'code/src/app.ts': 'export const ok = true;' }),
+      publisher: { publish: async () => {} },
+      logger: createLogger('test'),
+      model: 'unit'
+    });
+    const feedback = {
+      verdict: 'FAIL' as const,
+      contract: {
+        failingTests: [{ file: 'src/app.test.ts', test: 'should work', message: 'Expected true to be false' }],
+        coverage: { linesPct: 61.23, threshold: 80 },
+        requiredChanges: [{ summary: 'Fix failing test', details: 'Adjust assertion in src/app.test.ts' }],
+        generatedAt: new Date().toISOString()
+      }
+    };
+    await agent.run({ execId: 'exec-feedback', plan: makePlan() as Plan, feedback });
+    expect(createMock).toHaveBeenCalled();
+    const call = createMock.mock.calls[0][0];
+    const userMessage = (call.messages ?? []).find((m) => m.role === 'user');
+    expect(userMessage?.content).toContain('Required changes');
+    expect(userMessage?.content).toContain('Fix failing test');
+    expect(userMessage?.content).toContain('src/app.test.ts');
+    expect(userMessage?.content).toContain('Observed coverage: 61.23%');
+  });
 });
diff --git a/packages/implementer/src/__tests__/server.test.ts b/packages/implementer/src/__tests__/server.test.ts
index 27357ade0e68208e231d4d07994419ac211038b4..64a758a1731e8d68e21090158ad8689ef5b14497 100644
--- a/packages/implementer/src/__tests__/server.test.ts
+++ b/packages/implementer/src/__tests__/server.test.ts
@@ -1,64 +1,94 @@
 import request from 'supertest';
 import { describe, it, expect, vi, beforeEach } from 'vitest';
 
+const agentRunSpy = vi.fn(async () => ({ ok: true, files: ['src/app.ts'] }));
+
 vi.mock('../agent', () => {
-  class MockAgent { async run() { return { ok: true, files: ['src/app.ts'] }; } }
+  class MockAgent {
+    async run(...args: Parameters<typeof agentRunSpy>) {
+      return agentRunSpy(...args);
+    }
+  }
   return { ImplementerAgent: MockAgent };
 });
 
 const listFilesMock = vi.fn(async () => []);
 
 vi.mock('@autonomous/shared/src/vfs', () => ({
   createVfs: vi.fn(async () => ({
     writeFile: async () => {},
     readFile: async () => Buffer.from('x'),
     listFiles: listFilesMock,
     listVersions: async () => []
   }))
 }));
 
 vi.mock('@autonomous/shared/src/langfuse', () => ({ getLangfuse: () => null }));
 
 describe('implementer server', () => {
   let app: import('express').Express;
   beforeEach(async () => {
     vi.resetModules();
     process.env.OPENAI_API_KEY = 'test-key';
+    agentRunSpy.mockClear();
     const mod = await import('../server');
     app = mod.app;
     listFilesMock.mockClear();
   });
 
   it('returns 200 for valid request', async () => {
     const plan = { tasks: [{ id: '1', title: 'a', description: 'a' }, { id: '2', title: 'b', description: 'b' }], acceptance_criteria: ['x'] };
     const res = await request(app).post('/implement').send({ execId: 'e1', plan });
     expect(res.status).toBe(200);
     expect(res.body.ok).toBe(true);
     expect(res.body.files).toContain('src/app.ts');
   });
 
+  it('passes validator feedback through to the agent', async () => {
+    const plan = {
+      tasks: [
+        { id: '1', title: 'a', description: 'a' },
+        { id: '2', title: 'b', description: 'b', dependsOn: ['1'] }
+      ],
+      acceptance_criteria: ['x']
+    };
+    const feedback = {
+      verdict: 'FAIL' as const,
+      report: 'validator/validation-report.json',
+      contract: {
+        failingTests: [],
+        coverage: { linesPct: null, threshold: 80 },
+        requiredChanges: [],
+        generatedAt: new Date().toISOString()
+      }
+    };
+    const res = await request(app).post('/implement').send({ execId: 'e-feedback', plan, last_validator_feedback: feedback });
+    expect(res.status).toBe(200);
+    expect(agentRunSpy).toHaveBeenCalledWith(expect.objectContaining({ feedback }));
+  });
+
   it('400 on invalid body', async () => {
     const res = await request(app).post('/implement').send({});
     expect(res.status).toBe(400);
     expect(res.body.error).toBe('invalid request');
   });
 
   it('500 when agent throws', async () => {
     vi.resetModules();
     vi.doMock('../agent', () => {
       class BadAgent { async run() { throw new Error('boom'); } }
       return { ImplementerAgent: BadAgent };
     });
     const mod = await import('../server');
     const badApp = mod.app;
     const plan = { tasks: [{ id: '1', title: 'a', description: 'a' }, { id: '2', title: 'b', description: 'b' }], acceptance_criteria: ['x'] };
     const res = await request(badApp).post('/implement').send({ execId: 'e2', plan });
     expect(res.status).toBe(500);
     expect(res.body.error).toBe('boom');
   });
 
   it('reports healthy when dependencies succeed', async () => {
     const res = await request(app).get('/healthz');
     expect(res.status).toBe(200);
     expect(res.body).toEqual({ ok: true, checks: { minio: true, openaiKey: true } });
     expect(listFilesMock).toHaveBeenCalled();
diff --git a/packages/implementer/src/agent.ts b/packages/implementer/src/agent.ts
index cce6ada84d50bc790999ae5b6877dd9fac9d9805..88d57288c4a7a4e8a3552688bc6de198943e6182 100644
--- a/packages/implementer/src/agent.ts
+++ b/packages/implementer/src/agent.ts
@@ -1,103 +1,120 @@
 import type { Logger } from '@autonomous/shared/src/logger';
 import type { Plan } from '@autonomous/shared/src/plan';
 import type { Vfs, VfsFileEntry } from '@autonomous/shared/src/vfs';
 import type { Langfuse } from 'langfuse';
+import type { ValidatorRemediationContract } from '@autonomous/shared/src/validatorContract';
 import { ToolExecutor } from './tools';
 import type { EventPublisher } from './publisher';
 import type {
   ChatCompletionCreateParams,
   ChatCompletionMessage,
   ChatCompletionResult,
   ChatCompletionToolCall
 } from './types';
 
 export type ImplementerInput = {
   execId: string;
   plan: Plan;
+  feedback?: ValidatorFeedback | null;
 };
 
 export type ImplementerResult = {
   ok: boolean;
   files: string[];
   summary?: string | null;
   error?: string;
 };
 
 type OpenAIChatClient = {
   chat: {
     completions: {
       create: (params: ChatCompletionCreateParams) => Promise<ChatCompletionResult>;
     };
   };
 };
 
 type LangfuseTrace = {
   generation?: (payload: Record<string, unknown>) => void;
   log?: (payload: Record<string, unknown>) => void;
 };
 
 type LangfuseLike = {
   trace: (payload: Record<string, unknown>) => LangfuseTrace;
 };
 
 type ImplementerDeps = {
   client: OpenAIChatClient;
   vfs: Vfs;
   publisher: EventPublisher;
   logger: Logger;
   model: string;
   maxIterations?: number;
   langfuse?: (Langfuse | LangfuseLike | null) | null;
 };
 
+export type ValidatorFeedback = {
+  verdict: 'PASS' | 'FAIL';
+  report?: string;
+  junitObject?: string;
+  coverageObject?: string;
+  contract?: ValidatorRemediationContract;
+  receivedAt?: string;
+};
+
 const SYSTEM_PROMPT = [
   'You are the Implementer specialist in an autonomous software delivery platform.',
   'Use the provided tools to read and modify files under code/.',
   'Create clean, production-ready code with tests and respect existing conventions.',
   'Before overwriting, capture diffs or context so changes remain deterministic.',
   'Always acknowledge errors explicitly and retry with a different strategy if needed.'
 ].join(' ');
 
 export class ImplementerAgent {
   private readonly deps: ImplementerDeps;
 
   constructor(deps: ImplementerDeps) {
     this.deps = deps;
   }
 
   async run(input: ImplementerInput): Promise<ImplementerResult> {
     const toolExecutor = new ToolExecutor({
       vfs: this.deps.vfs,
       publisher: this.deps.publisher
     });
     const messages: ChatCompletionMessage[] = [
       { role: 'system', content: SYSTEM_PROMPT },
-      { role: 'user', content: buildUserPrompt(input.plan) }
+      { role: 'user', content: buildUserPrompt(input.plan, input.feedback) }
     ] as ChatCompletionMessage[];
 
     const trace = this.createTrace(input);
+    if (input.feedback) {
+      trace?.log?.({
+        name: 'validator.feedback',
+        payload: summarizeFeedbackForTrace(input.feedback)
+      });
+    }
 
     const maxIterations = this.deps.maxIterations ?? 8;
     let toolCallsObserved = false;
     for (let i = 0; i < maxIterations; i += 1) {
       try {
         let response: ChatCompletionResult;
         try {
           response = await this.deps.client.chat.completions.create({
             model: this.deps.model,
             messages,
             tools: toolExecutor.tools,
             // Encourage the model to actually call tools at least once to generate artifacts
             // Then relax to auto after we observe a tool call.
             tool_choice: toolCallsObserved ? 'auto' : 'required'
           });
         } catch (apiErr) {
           // Model/API error: log and break to partial handoff
           this.deps.logger.error({ err: (apiErr as Error).message }, 'openai api call failed');
           throw apiErr;
         }
         const choice = response.choices[0];
         const message = choice?.message;
         if (!choice || !message) {
           throw new Error('Implementer received empty response from OpenAI');
         }
@@ -208,47 +225,123 @@ export class ImplementerAgent {
     try {
       if (typeof (candidate as Langfuse).trace === 'function') {
         return (candidate as Langfuse).trace({ name: 'implementer.run', metadata: { execId: input.execId } }) as LangfuseTrace;
       }
       if (typeof (candidate as LangfuseLike).trace === 'function') {
         return (candidate as LangfuseLike).trace({ name: 'implementer.run', metadata: { execId: input.execId } });
       }
     } catch {
       return null;
     }
     return null;
   }
 
   // Ensure minimal project scaffold exists in VFS under code/
   // Avoids printing or logging secret values; only writes static content.
   // Idempotent: re-writes same files safely.
   // Adds a basic README and a minimal source file.
   private async ensureScaffold(input: ImplementerInput): Promise<void> {
     try {
       const existing = await this.deps.vfs.listFiles('code/');
       if (Array.isArray(existing) && existing.length > 0) return;
     } catch {
       // proceed to write
     }
     const readme = `# Execution ${input.execId}\n\nThis folder contains code artifacts for the execution.\n`;
-    const appTs = `export function hello(name: string): string { return \`Hello, \${name}!\`; }\n`;
+    const appTs = [
+      "export function hello(name: string): string {",
+      "  return `Hello, ${name}!`;",
+      "}",
+      ''
+    ].join('\n');
+    const appTest = [
+      "import { describe, it, expect } from 'vitest';",
+      "import { hello } from './app';",
+      '',
+      "describe('hello', () => {",
+      "  it('greets the provided name', () => {",
+      "    expect(hello('World')).toBe('Hello, World!');",
+      "  });",
+      "});",
+      ''
+    ].join('\n');
     await this.deps.vfs.writeFile('code/README.md', readme, { contentType: 'text/markdown' });
-    await this.deps.vfs.writeFile('code/app.ts', appTs, { contentType: 'text/plain' });
+    await this.deps.vfs.writeFile('code/src/app.ts', appTs, { contentType: 'application/typescript' });
+    await this.deps.vfs.writeFile('code/src/app.test.ts', appTest, { contentType: 'application/typescript' });
   }
 }
 
-function buildUserPrompt(plan: Plan) {
-  return [
+function buildUserPrompt(plan: Plan, feedback?: ValidatorFeedback | null) {
+  const segments = [
     'Execute the following implementation plan. Return DONE when satisfied.',
     'Plan JSON:',
     JSON.stringify(plan, null, 2)
-  ].join('\n');
+  ];
+  if (feedback && feedback.verdict === 'FAIL') {
+    segments.push('---');
+    const received = feedback.receivedAt ? ` (received ${feedback.receivedAt})` : '';
+    segments.push(`Previous validator verdict: FAIL${received}. Address every point below before responding DONE.`);
+    if (feedback.contract) {
+      const { requiredChanges = [], failingTests = [], coverage } = feedback.contract;
+      if (requiredChanges.length > 0) {
+        segments.push('Required changes:');
+        requiredChanges.forEach((change, idx) => {
+          const detail = change.details ? ` - ${change.details}` : '';
+          segments.push(`${idx + 1}. ${change.summary}${detail}`);
+          if (change.blockers && change.blockers.length > 0) {
+            segments.push(`   Blockers: ${change.blockers.join(', ')}`);
+          }
+        });
+      }
+      if (failingTests.length > 0) {
+        segments.push('Failing tests to repair:');
+        failingTests.forEach((test) => {
+          const message = test.message ? ` -> ${test.message}` : '';
+          segments.push(`- ${test.file}: ${test.test}${message}`);
+        });
+      }
+      if (coverage) {
+        const observed = typeof coverage.linesPct === 'number' ? `${coverage.linesPct.toFixed(2)}%` : 'unknown';
+        segments.push(`Observed coverage: ${observed}. Threshold: ${coverage.threshold}%`);
+        if (coverage.linesPct !== null && coverage.linesPct < coverage.threshold) {
+          segments.push('Increase test coverage to satisfy the required threshold.');
+        }
+      }
+    } else {
+      if (feedback.report) {
+        segments.push(`Validator report path: ${feedback.report}`);
+      }
+      if (feedback.junitObject) {
+        segments.push(`Runner JUnit artifact: ${feedback.junitObject}`);
+      }
+    }
+    segments.push('---');
+  }
+  return segments.join('\n');
 }
 
 function parseArgs(call: ChatCompletionToolCall): unknown {
   const raw = call.function.arguments || '{}';
   try {
     return JSON.parse(raw);
   } catch {
     return {};
   }
 }
+
+function summarizeFeedbackForTrace(feedback: ValidatorFeedback) {
+  const summary: Record<string, unknown> = {
+    verdict: feedback.verdict,
+    receivedAt: feedback.receivedAt
+  };
+  if (feedback.contract) {
+    summary.contract = {
+      requiredChanges: feedback.contract.requiredChanges?.map((c) => c.summary) ?? [],
+      failingTests: feedback.contract.failingTests?.map((t) => `${t.file}:${t.test}`) ?? [],
+      coverage: feedback.contract.coverage
+    };
+  }
+  if (feedback.report) summary.report = feedback.report;
+  if (feedback.junitObject) summary.junitObject = feedback.junitObject;
+  if (feedback.coverageObject) summary.coverageObject = feedback.coverageObject;
+  return summary;
+}
diff --git a/packages/implementer/src/server.ts b/packages/implementer/src/server.ts
index d2c20e36e3717a9fb1a1adf0a68f3524b79c66be..060646be31ba6610e9c078108ce5a6b578db90e3 100644
--- a/packages/implementer/src/server.ts
+++ b/packages/implementer/src/server.ts
@@ -1,85 +1,96 @@
 import express, { type Request, type Response } from 'express';
 import OpenAI from 'openai';
 import { z } from 'zod';
 import { createLogger, createHttpLogger } from '@autonomous/shared/src/logger';
 import { env } from '@autonomous/shared/src/env';
 import { createVfs } from '@autonomous/shared/src/vfs';
 import { PlanSchema } from '@autonomous/shared/src/plan';
+import { ValidatorRemediationContractSchema } from '@autonomous/shared/src/validatorContract';
 import { startOtel } from '@autonomous/shared/src/otel';
 import { getLangfuse } from '@autonomous/shared/src/langfuse';
 import { RedisEventPublisher } from './publisher';
 import { ImplementerAgent } from './agent';
 import { registerShutdown } from '@autonomous/shared/src/shutdown';
 import { redisPub, redisSub } from '@autonomous/shared/src/events';
 
 startOtel('implementer');
 
 export const app = express();
 const logger = createLogger('implementer');
 app.use(createHttpLogger(logger));
 app.use(express.json({ limit: '2mb' }));
 
+const ValidatorFeedbackSchema = z.object({
+  verdict: z.enum(['PASS', 'FAIL']),
+  report: z.string().optional(),
+  junitObject: z.string().optional(),
+  coverageObject: z.string().optional(),
+  contract: ValidatorRemediationContractSchema.optional(),
+  receivedAt: z.string().optional()
+});
+
 const RequestSchema = z.object({
   execId: z.string().min(1),
-  plan: PlanSchema
+  plan: PlanSchema,
+  last_validator_feedback: ValidatorFeedbackSchema.optional()
 });
 
 app.post('/implement', async (req: Request, res: Response) => {
   const parseResult = RequestSchema.safeParse(req.body);
   if (!parseResult.success) {
     return res.status(400).json({ error: 'invalid request', details: parseResult.error.issues });
   }
-  const { execId, plan } = parseResult.data;
+  const { execId, plan, last_validator_feedback: feedback } = parseResult.data;
   try {
     const [vfs, langfuse] = await Promise.all([
       createVfs(execId),
       Promise.resolve(getLangfuse())
     ]);
 
     // Advisory: read validator report if present and attach to plan metadata
     let advisoryPlan = plan;
     try {
       const prefix = String(process.env.VALIDATOR_ARTIFACT_PREFIX || 'validator').replace(/\/+$/,'');
       const reportPath = `${prefix}/validation-report.json`;
       const buf = await vfs.readFile(reportPath);
       const reportJson = JSON.parse(buf.toString('utf8')) as unknown;
       // Non-invasive: embed under _validator_advisory for the agent prompt construction
       advisoryPlan = { ...plan, _validator_advisory: reportJson } as unknown as typeof plan;
     } catch {}
 
     const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
     const publisher = new RedisEventPublisher(execId);
     const agent = new ImplementerAgent({
       client,
       logger,
       model: process.env.OPENAI_MODEL || 'gpt-4o-2024-08-06',
       publisher,
       vfs,
       langfuse
     });
-    const result = await agent.run({ execId, plan: advisoryPlan });
+    const result = await agent.run({ execId, plan: advisoryPlan, feedback });
     res.json(result);
   } catch (err) {
     const e = err as Error;
     logger.warn({ execId, err: e.message }, 'implementer encountered error; attempting partial handoff');
     try {
       const vfs = await createVfs(execId);
       const files = (await vfs.listFiles()).filter((f) => f.path.startsWith('code/')).map((f) => f.path);
       if (files.length > 0) {
         // Return ok:true to allow pipeline to proceed to runner/validator
         return res.json({ ok: true, files });
       }
     } catch {}
     logger.error({ execId, err: e.message }, 'implementer run failed (no artifacts to hand off)');
     res.status(500).json({ error: e.message });
   }
 });
 
 app.get('/healthz', async (_req, res) => {
   const checks: Record<string, boolean> = {
     minio: false,
     openaiKey: false
   };
 
   try {
     const vfs = await createVfs('healthz', { prefixSuffix: 'implementer' });
diff --git a/packages/mca/src/__tests__/server.test.ts b/packages/mca/src/__tests__/server.test.ts
index 6fea3009a39675c269ff2a7a90cfe186460f2613..7372483e3ab48c1b5ef74374d60158296355a187 100644
--- a/packages/mca/src/__tests__/server.test.ts
+++ b/packages/mca/src/__tests__/server.test.ts
@@ -36,52 +36,52 @@ const defaultValidatorPayload: ValidatorPayload = {
     generatedAt: new Date().toISOString()
   }
 };
 
 let validatorPayload: ValidatorPayload = { ...defaultValidatorPayload };
 
 const baseFetchImplementation = async (url: string, init?: Record<string, unknown>) => {
   const body = typeof init?.body === 'string' ? JSON.parse(init.body) : { execId: 'exec-1' };
   if (url.includes('/plan')) {
     return {
       ok: true,
       json: async () => ({ object: `${body.execId}/plan.json` })
     };
   }
   if (url.includes('/implement')) {
     return {
       ok: true,
       json: async () => ({ ok: true, files: ['src/app.ts'] })
     };
   }
   if (url.includes('/run')) {
     return {
       ok: true,
       json: async () => ({
         ok: true,
-        junitObject: `${body.execId}/runner/junit.xml`,
-        coverageObject: `${body.execId}/runner/coverage.json`
+        junitObject: 'runner/junit.xml',
+        coverageObject: 'runner/coverage.json'
       })
     };
   }
   if (url.includes('/validate')) {
     return {
       ok: true,
       json: async () => validatorPayload
     };
   }
   return {
     ok: false,
     json: async () => ({ error: 'unknown route' })
   };
 };
 
 // Mock the shared http helper so we can assert calls directly
 const fetchStub: ReturnType<typeof vi.fn> = vi.fn(baseFetchImplementation);
 const nodes: Record<string, (state: unknown) => Promise<unknown> | unknown> = {};
 let conditional: ((state: unknown) => string | symbol | null) | null = null;
 const START = Symbol('start');
 const END = Symbol('end');
 
 vi.mock('@langchain/langgraph', () => ({
   StateGraph: class {
     addNode(name: string, fn: (state: unknown) => unknown) {
diff --git a/packages/mca/src/server.ts b/packages/mca/src/server.ts
index a17b276ff26d4f1279b405774cee06041e750eef..27cfdc16342c3ee76b5ae4c1a6e4cfba3d487faa 100644
--- a/packages/mca/src/server.ts
+++ b/packages/mca/src/server.ts
@@ -63,51 +63,55 @@ async function plannerNode(state: McaState): Promise<McaState> {
   const { fetchWithTimeout, withTraceHeaders } = await import('@autonomous/shared/src/http');
   const r = await fetchWithTimeout(plannerUrl, withTraceHeaders({
     method: 'POST', headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ execId: state.execId, intent: state.intent })
   }), { timeoutMs: 5000, retries: 2 });
   const j = (await r.json()) as { object?: string; error?: string };
   if (!r.ok) throw new Error(j.error || 'planner failed');
   if (!j.object) throw new Error('planner did not return plan object');
   const plan = await readPlanFromMinio(j.object);
   await upsertExecution(state.execId, 'planned', state.intent, 'planner');
   await publish(state.execId, 'artifact', { type: 'plan', object: j.object });
   await publish(state.execId, 'status', { status: 'planned' });
   return { ...state, status: 'planned', plan, current_agent: 'planner' };
 }
 
 async function implementerNode(state: McaState): Promise<McaState> {
   if (!state.plan) throw new Error('plan missing from state');
   const implementerUrl = process.env.IMPLEMENTER_URL || 'http://localhost:7030/implement';
   await publish(state.execId, 'agent', { agent: 'implementer', status: 'working' });
   await upsertExecution(state.execId, 'implementing', state.intent, 'implementer');
   await publish(state.execId, 'status', { status: 'implementing' });
   const { fetchWithTimeout, withTraceHeaders } = await import('@autonomous/shared/src/http');
   const response = await fetchWithTimeout(implementerUrl, withTraceHeaders({
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
-    body: JSON.stringify({ execId: state.execId, plan: state.plan })
+    body: JSON.stringify({
+      execId: state.execId,
+      plan: state.plan,
+      last_validator_feedback: state.last_validator_feedback
+    })
   }), { timeoutMs: 5000, retries: 2 });
   const payload = (await response.json()) as { ok?: boolean; files?: string[]; error?: string };
   if (!response.ok || payload.ok !== true) {
     throw new Error(payload.error || 'implementer failed');
   }
   await upsertExecution(state.execId, 'implemented', state.intent, 'implementer');
   await publish(state.execId, 'status', { status: 'implemented' });
   await publish(state.execId, 'artifact', { type: 'code', files: payload.files ?? [] });
   return { ...state, status: 'implemented', current_agent: 'implementer' };
 }
 
 async function runnerNode(state: McaState): Promise<McaState> {
   const runnerUrl = process.env.RUNNER_URL || 'http://localhost:7040/run';
   await publish(state.execId, 'agent', { agent: 'runner', status: 'working' });
   let payload: { ok?: boolean; junitObject?: string; coverageObject?: string; error?: string } = {};
   try {
     const { fetchWithTimeout, withTraceHeaders } = await import('@autonomous/shared/src/http');
     const response = await fetchWithTimeout(runnerUrl, withTraceHeaders({
       method: 'POST', headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ execId: state.execId })
     }), { timeoutMs: 5000, retries: 2 });
     payload = (await response.json()) as { ok?: boolean; junitObject?: string; coverageObject?: string; error?: string };
     if (!response.ok || payload.ok !== true) {
       // Warn and proceed to validator; do not hard-abort here
       logger.warn({ execId: state.execId, err: payload.error || 'runner failed' }, 'runner step encountered error; continuing to validator');
diff --git a/packages/runner/src/agent.ts b/packages/runner/src/agent.ts
index 71fc2cfc93e0a98a258fc1bd40d70d0dfb157f75..9cd18cdf1bac3da879374a795af94f465cff375f 100644
--- a/packages/runner/src/agent.ts
+++ b/packages/runner/src/agent.ts
@@ -113,118 +113,152 @@ export class RunnerAgent {
           target: 'ES2022',
           module: 'ESNext',
           moduleResolution: 'Bundler',
           esModuleInterop: true,
           strict: true,
           skipLibCheck: true,
           rootDir: './src',
           outDir: './dist'
         },
         include: ['src']
       };
       await sandbox.files.write(`${projectRoot}/tsconfig.json`, JSON.stringify(tsconfig, null, 2));
 
       // Write code files (strip leading 'code/' prefix)
       for (const f of codeFiles) {
         const data = await vfs.readFile(f.path);
         const rel = f.path.replace(/^code\//, '');
         const dest = `${projectRoot}/src/${rel}`;
         const parent = dest.substring(0, dest.lastIndexOf('/'));
         if (parent) await sandbox.files.makeDir(parent, { recursive: true });
         await sandbox.files.write(dest, data.toString('utf8'));
       }
 
       // Install deps
       await this.runCommand(sandbox, projectRoot, 'npm install --silent');
-      // Run tests and capture JSON reporter output
-      const testResult = await this.runCommand(sandbox, projectRoot, 'npm run test --silent');
+      // Run tests and capture JSON reporter output. Allow non-zero exit codes so we can persist artifacts.
+      const testResult = await this.runCommand(sandbox, projectRoot, 'npm run test --silent', { allowNonZero: true });
+      const vitestStdout = typeof testResult.stdout === 'string' ? testResult.stdout : '';
 
       // Save raw JSON reporter to MinIO for audit
       const vitestJsonObject = `runner/vitest-results.json`;
-      await vfs.writeFile(vitestJsonObject, testResult.stdout);
+      await vfs.writeFile(vitestJsonObject, vitestStdout, { contentType: 'application/json' });
 
       // Convert to JUnit XML (simple adapter: one testsuite)
-      const junitXml = this.vitestJsonToJUnit(testResult.stdout);
+      const junitXml = this.vitestJsonToJUnit(vitestStdout);
       const junitObject = `runner/junit.xml`;
       await vfs.writeFile(junitObject, junitXml, { contentType: 'application/xml' });
 
       // Read coverage summary from sandbox
       const coverageSummaryPath = `${projectRoot}/coverage/coverage-summary.json`;
       let coverageJson: string;
       try {
         coverageJson = await sandbox.files.read(coverageSummaryPath, { format: 'text' }) as string;
       } catch (e) {
-        return { ok: false, error: 'coverage summary not found' };
+        const err = e as Error;
+        coverageJson = JSON.stringify({ error: 'coverage summary not found', message: err.message });
       }
-      const coverageObject = `runner/coverage-summary.json`;
-      await vfs.writeFile(coverageObject, coverageJson);
+      const coverageObject = `runner/coverage.json`;
+      await vfs.writeFile(coverageObject, coverageJson, { contentType: 'application/json' });
 
-      await publish(execId, 'artifact', { type: 'runner_results', junit: junitObject, coverage: coverageObject });
-      await publish(execId, 'agent', { agent: 'runner', status: 'completed' });
+      await publish(execId, 'artifact', {
+        type: 'runner_results',
+        junit: junitObject,
+        coverage: coverageObject,
+        vitest: vitestJsonObject,
+        testsExitCode: testResult.exitCode
+      });
+      await publish(execId, 'agent', {
+        agent: 'runner',
+        status: testResult.exitCode === 0 ? 'completed' : 'failed',
+        testsExitCode: testResult.exitCode
+      });
+      if (testResult.exitCode !== 0) {
+        const errorMessage = `tests failed with exit code ${testResult.exitCode}`;
+        this.logger.error({ exitCode: testResult.exitCode }, 'runner tests failed');
+        return { ok: false, junitObject, coverageObject, error: errorMessage };
+      }
       return { ok: true, junitObject, coverageObject };
     } catch (err) {
       const e = err as Error;
       // Include stack and structured context to make root-cause diagnosis easier
       this.logger.error({ err: e.message, stack: e.stack }, 'runner failed');
       await publish(execId, 'agent', { agent: 'runner', status: 'failed', error: e.message, stack: e.stack });
       return { ok: false, error: e.message };
     } finally {
       try { await sandbox.kill?.(); } catch {}
     }
   }
 
-  private async runCommand(sandbox: SandboxApi, cwd: string, cmd: string): Promise<CommandResult> {
+  private async runCommand(sandbox: SandboxApi, cwd: string, cmd: string, options?: { allowNonZero?: boolean }): Promise<CommandResult> {
     // E2B 2.x SDK expects: sandbox.commands.run(command, { args, cwd, env })
     try {
       const parts = typeof cmd === 'string' ? cmd.split(' ') : [];
       const command = parts[0] ?? String(cmd);
       const args = parts.slice(1);
       // Log the runtime types to help diagnose SDK mismatches
       this.logger.info({ command, args, cwd }, `runCommand starting`);
       try {
         const result = await sandbox.commands.run(command, { args, cwd, env: {} });
         if (result.exitCode !== 0) {
+          if (options?.allowNonZero) {
+            this.logger.warn({ command, args, exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr }, 'command exited non-zero but allowNonZero=true');
+            return result;
+          }
           // Command returned non-zero exit code
           const output = `stdout:\n${result.stdout}\n\nstderr:\n${result.stderr}`;
           this.logger.error({
             command,
             args,
             exitCode: result.exitCode,
             stdout: result.stdout,
             stderr: result.stderr
           }, `command exited with code ${result.exitCode}`);
           throw new Error(`command failed with exit code ${result.exitCode}: ${cmd}\n${output}`);
         }
         this.logger.info({ command, args, exitCode: 0 }, `command succeeded`);
         return result;
       } catch (innerErr) {
         // The SDK may throw CommandExitError or similar
         const ie = innerErr as any;
         // Try to extract output from the error object
         const errorMsg = ie.message || String(ie);
         const stdout = ie.stdout || '';
         const stderr = ie.stderr || '';
+        if (options?.allowNonZero) {
+          const exitCode = typeof ie.exitCode === 'number' ? ie.exitCode : 1;
+          this.logger.warn({
+            command,
+            args,
+            cwd,
+            exitCode,
+            stdout,
+            stderr,
+            err: errorMsg
+          }, `sandbox.commands.run returned non-zero (allowNonZero)`);
+          return { exitCode, stdout, stderr };
+        }
         this.logger.error({
           err: errorMsg,
           stack: ie.stack,
           command,
           args,
           cwd,
           stdout,
           stderr
         }, `sandbox.commands.run threw error`);
         throw new Error(`${cmd} failed: ${errorMsg}\nstdout: ${stdout}\nstderr: ${stderr}`);
       }
     } catch (err) {
       const e = err as Error;
       this.logger.error({ err: e.message, stack: e.stack }, `runCommand failed`);
       throw e;
     }
   }
 
   private vitestJsonToJUnit(stdout: string): string {
     // Best-effort conversion: Treat whole run as single testsuite
     let results: VitestJson = {};
     try { results = JSON.parse(stdout) as VitestJson; } catch {
       results = { duration: 0, numTotalTests: 0, numPassedTests: 0, testResults: [] };
     }
     const cases: VitestTestCase[] = Array.isArray(results.testResults) ? results.testResults : [];
diff --git a/packages/runner/src/compat.ts b/packages/runner/src/compat.ts
index 8c9b0a925c5d6691f52a663b02a71059049b9ef6..eb39895ccff2f9067176ca0c37ea81cbf0935f8e 100644
--- a/packages/runner/src/compat.ts
+++ b/packages/runner/src/compat.ts
@@ -43,40 +43,40 @@ export async function createVfs(execId: string, opts?: { prefixSuffix?: string }
   }
   const m = await importShared('vfs.js');
   return (m as { createVfs: (id: string, o?: { prefixSuffix?: string }) => Promise<unknown> }).createVfs(execId, opts);
 }
 
 export async function publish(execId: string, event: string, data: unknown) {
   if (IS_TEST) {
     const m = await loadSrc<typeof import('@autonomous/shared/src/events')>('@autonomous/shared/src/events');
     return m.publish(execId, event, data);
   }
   const m = await importShared('events.js');
   return (m as { publish: (id: string, ev: string, d: unknown) => Promise<void> }).publish(execId, event, data);
 }
 
 export async function publishWithTrace(execId: string, event: string, data: unknown) {
   if (IS_TEST) {
     const m = await loadSrc<typeof import('@autonomous/shared/src/events')>('@autonomous/shared/src/events');
     return m.publishWithTrace(execId, event, data);
   }
   const m = await importShared('events.js');
   return (m as { publishWithTrace: (id: string, ev: string, d: unknown) => Promise<void> }).publishWithTrace(execId, event, data);
 }
 
 export async function createLogger(service: string) {
   if (IS_TEST) {
-    return { info: () => {}, error: () => {} } as { info: Function; error: Function };
+    return { info: () => {}, error: () => {}, warn: () => {} } as { info: Function; error: Function; warn: Function };
   }
   const m = await importShared('logger.js');
-  return (m as { createLogger: (s: string) => { info: Function; error: Function } }).createLogger(service);
+  return (m as { createLogger: (s: string) => { info: Function; error: Function; warn: Function } }).createLogger(service);
 }
 
 export async function startOtel(service: string) {
   try {
     if (IS_TEST) return;
     const m = await importShared('otel.js');
     return (m as { startOtel: (s: string) => void }).startOtel(service);
   } catch {
     return;
   }
 }
diff --git a/packages/runner/src/server.test.ts b/packages/runner/src/server.test.ts
index 5b448e25fae1e3bea2dc65441c4edac0390b79a0..ce1d774d94c1b5ad0a6da0caac30458294a05511 100644
--- a/packages/runner/src/server.test.ts
+++ b/packages/runner/src/server.test.ts
@@ -1,80 +1,144 @@
 import { describe, it, expect, vi, beforeEach } from 'vitest';
 import request from 'supertest';
 import * as vfsMod from '@autonomous/shared/src/vfs';
 import * as events from '@autonomous/shared/src/events';
 
 // Mock VFS to avoid MinIO in unit tests
 class MemVfs implements vfsMod.Vfs {
   private store = new Map<string, Buffer>();
   async writeFile(p: string, c: Buffer | string): Promise<void> {
     const b = typeof c === 'string' ? Buffer.from(c, 'utf8') : c;
     this.store.set(p, b);
   }
   async readFile(p: string): Promise<Buffer> { const b = this.store.get(p); if (!b) throw new Error('nf'); return b; }
   async listFiles(): Promise<vfsMod.VfsFileEntry[]> {
     return Array.from(this.store.keys()).map((k) => ({ path: k, size: this.store.get(k)!.length, lastModified: new Date() }));
   }
   async listVersions(): Promise<vfsMod.VfsVersionEntry[]> { return []; }
 }
 
+const sandboxRunMock = vi.fn(async () => ({
+  exitCode: 0,
+  stdout: JSON.stringify({ numTotalTests: 1, numPassedTests: 1, duration: 10, testResults: [{ name: 'ok', status: 'pass', duration: 10 }] }),
+  stderr: ''
+}));
+
+const coverageReadMock = vi.fn(async (p: string) => {
+  if (p.endsWith('coverage/coverage-summary.json')) {
+    return JSON.stringify({ total: { lines: { pct: 100 } } });
+  }
+  throw new Error('nf');
+});
+
 // Fake sandbox API updated to match agent.ts API shape
 class FakeSandbox {
   files = {
     makeDir: async () => true,
     write: async () => {},
-    read: async (p: string) => {
-      if (p.endsWith('coverage/coverage-summary.json')) return JSON.stringify({ total: { lines: { pct: 100 } } });
-      throw new Error('nf');
-    }
+    read: coverageReadMock
   };
   commands = {
-    run: async (_cmd: string, _opts?: { args?: string[]; cwd?: string; env?: Record<string, string> }) => ({
-      exitCode: 0,
-      stdout: JSON.stringify({ numTotalTests: 1, numPassedTests: 1, duration: 10, testResults: [{ name: 'ok', status: 'pass', duration: 10 }] }),
-      stderr: ''
-    })
+    run: sandboxRunMock
   };
   async kill() {}
+  static async create() {
+    return new FakeSandbox();
+  }
 }
 
 vi.mock('@e2b/sdk', () => ({ Sandbox: FakeSandbox }));
 let app: import('express').Express;
 
 describe('runner server', () => {
   beforeEach(() => {
     process.env.E2B_API_KEY = 'test-key';
     vi.restoreAllMocks();
+    sandboxRunMock.mockClear();
+    coverageReadMock.mockClear();
+    sandboxRunMock.mockResolvedValue({
+      exitCode: 0,
+      stdout: JSON.stringify({ numTotalTests: 1, numPassedTests: 1, duration: 10, testResults: [{ name: 'ok', status: 'pass', duration: 10 }] }),
+      stderr: ''
+    });
+    coverageReadMock.mockImplementation(async (p: string) => {
+      if (p.endsWith('coverage/coverage-summary.json')) {
+        return JSON.stringify({ total: { lines: { pct: 100 } } });
+      }
+      throw new Error('nf');
+    });
     vi.spyOn(events, 'publish').mockResolvedValue();
+    vi.spyOn(events, 'publishWithTrace').mockResolvedValue();
     vi.spyOn(vfsMod, 'createVfs').mockResolvedValue(
       new MemVfs() as unknown as Awaited<ReturnType<typeof vfsMod.createVfs>>
     );
   });
 
   it('runs tests and uploads artifacts', async () => {
     // Import server after mocks are in place
     ({ app } = await import('./server'));
     const vfs = await vfsMod.createVfs('x');
     await vfs.writeFile('code/src/app.ts', 'export const x=1;');
     await vfs.writeFile('code/src/app.test.ts', 'import {x} from "./app"; if(x!==1) throw new Error("bad");');
     const res = await request(app).post('/run').send({ execId: 'x' });
     expect(res.status).toBe(200);
     expect(res.body.ok).toBe(true);
+    const junit = await vfs.readFile('runner/junit.xml');
+    expect(junit.toString()).toContain('<testsuite');
+    const coverage = await vfs.readFile('runner/coverage.json');
+    expect(coverage.toString()).toContain('pct');
+    const vitest = await vfs.readFile('runner/vitest-results.json');
+    expect(vitest.toString()).toContain('numTotalTests');
+    expect(events.publish).toHaveBeenCalledWith('x', 'artifact', expect.objectContaining({ junit: 'runner/junit.xml', coverage: 'runner/coverage.json' }));
+  });
+
+  it('persists artifacts even when tests fail', async () => {
+    sandboxRunMock.mockImplementation(async (_cmd: string, opts?: { args?: string[] }) => {
+      const args = opts?.args ?? [];
+      if (args.includes('test')) {
+        return {
+          exitCode: 1,
+          stdout: JSON.stringify({
+            numTotalTests: 1,
+            numPassedTests: 0,
+            duration: 12,
+            testResults: [{ name: 'fails', status: 'fail', duration: 12, error: { message: 'boom' } }]
+          }),
+          stderr: 'tests failed'
+        };
+      }
+      return { exitCode: 0, stdout: '', stderr: '' };
+    });
+    ({ app } = await import('./server'));
+    const vfs = await vfsMod.createVfs('y');
+    await vfs.writeFile('code/src/app.ts', 'export const x=1;');
+    await vfs.writeFile('code/src/app.test.ts', 'import {x} from "./app"; throw new Error("boom");');
+    const res = await request(app).post('/run').send({ execId: 'y' });
+    expect(sandboxRunMock).toHaveBeenCalledTimes(2);
+    expect(res.status).toBe(200);
+    expect(res.body.ok).toBe(false);
+    expect(res.body.junitObject).toBe('runner/junit.xml');
+    expect(res.body.coverageObject).toBe('runner/coverage.json');
+    const junit = await vfs.readFile('runner/junit.xml');
+    expect(junit.toString()).toContain('failure');
+    const coverage = await vfs.readFile('runner/coverage.json');
+    expect(coverage.toString()).toMatch(/pct|coverage summary/);
+    expect(events.publish).toHaveBeenCalledWith('y', 'artifact', expect.objectContaining({ testsExitCode: 1 }));
   });
 
   it('returns healthy status when dependencies succeed', async () => {
     ({ app } = await import('./server'));
     const res = await request(app).get('/healthz');
     expect(res.status).toBe(200);
     expect(res.body).toEqual({ ok: true, checks: { vfs: true, e2bKey: true } });
     expect(vfsMod.createVfs).toHaveBeenCalledWith('healthz', { prefixSuffix: 'runner' });
   });
 
   it('returns 503 when E2B key is missing', async () => {
     process.env.E2B_API_KEY = '';
     ({ app } = await import('./server'));
     const res = await request(app).get('/healthz');
     expect(res.status).toBe(503);
     expect(res.body).toEqual({ ok: false, checks: { vfs: true, e2bKey: false } });
     process.env.E2B_API_KEY = 'test-key';
   });
 });
diff --git a/packages/runner/src/server.ts b/packages/runner/src/server.ts
index 59790a6da1810af9935ebaebe1d13f8417e7187e..2d030389ae60644878fa2025bc3f7f9e1a5ffd14 100644
--- a/packages/runner/src/server.ts
+++ b/packages/runner/src/server.ts
@@ -1,74 +1,84 @@
 import express, { type Request, type Response } from 'express';
 import { z } from 'zod';
 import { startOtel, createLogger, createVfs } from './compat';
 import { RunnerAgent, RunRequestSchema } from './agent';
 import { registerShutdown } from '@autonomous/shared/src/shutdown';
 import { createHttpLogger } from '@autonomous/shared/src/logger';
 
 function logStartupError(message: string, e: unknown) {
   const errMsg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
   process.stderr.write(`${message} ${errMsg}\n`);
 }
 
 // Initialize async services on startup
-let logger: { info: (...args: unknown[]) => unknown; error: (...args: unknown[]) => unknown } = { info: () => {}, error: () => {} };
+let logger: {
+  info: (...args: unknown[]) => unknown;
+  error: (...args: unknown[]) => unknown;
+  warn: (...args: unknown[]) => unknown;
+} = { info: () => {}, error: () => {}, warn: () => {} };
 (async () => {
   try {
     await startOtel('runner');
   } catch (e) {
     logStartupError('Failed to start OTel:', e);
   }
   try {
     // createLogger may return a logger shaped with generic Function types; cast to the explicit signature
-    logger = (await createLogger('runner')) as unknown as { info: (...args: unknown[]) => unknown; error: (...args: unknown[]) => unknown };
+    logger = (await createLogger('runner')) as unknown as {
+      info: (...args: unknown[]) => unknown;
+      error: (...args: unknown[]) => unknown;
+      warn: (...args: unknown[]) => unknown;
+    };
   } catch (e) {
     logStartupError('Failed to create logger:', e);
   }
 })();
 
 export const app = express();
 // Use a wrapper so the middleware uses the latest logger reference when requests arrive
 app.use((req, res, next) => createHttpLogger(logger as any)(req, res, next));
 app.use(express.json({ limit: '2mb' }));
 
 app.get('/healthz', async (_req, res) => {
   const checks: Record<string, boolean> = {
     vfs: false,
     e2bKey: false
   };
 
   try {
     const vfs = (await createVfs('healthz', { prefixSuffix: 'runner' })) as unknown as { listFiles: () => Promise<unknown> };
     await vfs.listFiles();
     checks.vfs = true;
   } catch (err) {
     const error = err as Error;
     logger.error({ err: error.message }, 'runner vfs health check failed');
   }
 
   if (process.env.E2B_API_KEY) {
     checks.e2bKey = true;
   } else {
     logger.error('runner missing E2B_API_KEY');
   }
 
   const ok = Object.values(checks).every(Boolean);
   if (!ok) return res.status(503).json({ ok: false, checks });
   return res.json({ ok: true, checks });
 });
 
 app.post('/run', async (req: Request, res: Response) => {
   const parse = RunRequestSchema.safeParse(req.body);
   if (!parse.success) return res.status(400).json({ error: 'invalid request', details: parse.error.issues });
   const agent = new RunnerAgent(logger);
   const result = await agent.run(parse.data);
-  if (!result.ok) return res.status(500).json(result);
-  res.json(result);
+  if (!result.ok) {
+    logger.warn({ execId: parse.data.execId, error: result.error }, 'runner completed with test failures');
+  }
+  res.status(200).json(result);
 });
 
 const port = Number(process.env.RUNNER_PORT || 7040);
 if (process.env.NODE_ENV !== 'test') {
   const server = app.listen(port, () => logger.info({ port }, 'runner listening'));
 
   registerShutdown({ server, logger });
 }
 
EOF
)