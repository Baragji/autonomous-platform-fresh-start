 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/packages/implementer/src/__tests__/agent.unit.test.ts b/packages/implementer/src/__tests__/agent.unit.test.ts
index af52f093702e8cdabdbbcf1cc0cb2289cf6432c0..dd6c57c146e732652a442127cb0f8a251ec4678e 100644
--- a/packages/implementer/src/__tests__/agent.unit.test.ts
+++ b/packages/implementer/src/__tests__/agent.unit.test.ts
@@ -1,31 +1,31 @@
-import { describe, it, expect } from 'vitest';
+import { describe, it, expect, vi } from 'vitest';
 import { ImplementerAgent } from '../agent';
 import { createLogger } from '@autonomous/shared/src/logger';
 import type { Vfs, VfsFileEntry, VfsVersionEntry } from '@autonomous/shared/src/vfs';
 import type { Plan } from '@autonomous/shared/src/plan';
-import type { ChatCompletionResult, ChatCompletionCreateParams } from '../types';
+import type { ChatCompletionResult, ChatCompletionCreateParams, ChatCompletionMessage } from '../types';
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
 }
 
 function makePlan() {
   return {
     tasks: [
@@ -104,26 +104,111 @@ describe('ImplementerAgent (unit)', () => {
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
+  it('injects validator feedback into the first user prompt', async () => {
+    const calls: ChatCompletionResult[] = [
+      {
+        id: 'cmpl-1',
+        choices: [
+          {
+            finish_reason: 'tool_calls',
+            index: 0,
+            logprobs: null,
+            message: {
+              role: 'assistant',
+              content: null,
+              refusal: null,
+              tool_calls: [
+                { id: 'call_1', type: 'function', function: { name: 'create', arguments: JSON.stringify({ path: 'src/app.ts', content: 'console.log("ok")\n' }) } }
+              ]
+            }
+          }
+        ],
+        created: Date.now() / 1000,
+        model: 'unit',
+        object: 'chat.completion'
+      },
+      {
+        id: 'cmpl-2',
+        choices: [
+          {
+            finish_reason: 'stop',
+            index: 0,
+            logprobs: null,
+            message: { role: 'assistant', content: 'DONE', refusal: null }
+          }
+        ],
+        created: Date.now() / 1000,
+        model: 'unit',
+        object: 'chat.completion'
+      }
+    ];
+    let capturedMessages: ChatCompletionMessage[] | undefined;
+    const openAiStub = {
+      chat: {
+        completions: {
+          create: vi.fn(async (params: ChatCompletionCreateParams) => {
+            capturedMessages = params.messages;
+            return calls.shift()!;
+          })
+        }
+      }
+    } as unknown as { chat: { completions: { create: (p: ChatCompletionCreateParams) => Promise<ChatCompletionResult> } } };
+
+    const feedback = {
+      verdict: 'FAIL' as const,
+      report: 'validator/validation-report.json',
+      junitObject: 'runner/junit.xml',
+      coverageObject: 'runner/coverage.json',
+      contract: {
+        failingTests: [
+          { file: 'src/app.test.ts', test: 'adds numbers', message: 'Expected 4 received 5' }
+        ],
+        coverage: { linesPct: 62, threshold: 80 },
+        requiredChanges: [
+          { summary: 'Fix failing tests', details: 'Update addition logic so tests pass' }
+        ],
+        generatedAt: new Date().toISOString()
+      }
+    };
+
+    const agent = new ImplementerAgent({
+      client: openAiStub,
+      vfs: memoryVfs(),
+      publisher: { publish: async () => {} },
+      logger: createLogger('test'),
+      model: 'unit'
+    });
+
+    const res = await agent.run({ execId: 'exec-3', plan: makePlan() as Plan, feedback });
+    expect(res.ok).toBe(true);
+    expect(openAiStub.chat.completions.create).toHaveBeenCalled();
+    const userMessage = capturedMessages?.find((msg) => msg.role === 'user');
+    expect(userMessage?.content).toContain('Validator verdict: FAIL');
+    expect(userMessage?.content).toContain('Fix failing tests');
+    expect(userMessage?.content).toContain('src/app.test.ts');
+    expect(userMessage?.content).toContain('validator/validation-report.json');
+  });
 });
diff --git a/packages/implementer/src/__tests__/server.test.ts b/packages/implementer/src/__tests__/server.test.ts
index 27357ade0e68208e231d4d07994419ac211038b4..7b4ea3dec6b8b3f893ab22b14689812206c8af69 100644
--- a/packages/implementer/src/__tests__/server.test.ts
+++ b/packages/implementer/src/__tests__/server.test.ts
@@ -1,62 +1,93 @@
 import request from 'supertest';
 import { describe, it, expect, vi, beforeEach } from 'vitest';
 
+const runMock = vi.fn(async () => ({ ok: true, files: ['src/app.ts'] }));
+
 vi.mock('../agent', () => {
-  class MockAgent { async run() { return { ok: true, files: ['src/app.ts'] }; } }
+  class MockAgent {
+    async run(input: unknown) {
+      return runMock(input);
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
     const mod = await import('../server');
     app = mod.app;
     listFilesMock.mockClear();
+    runMock.mockClear();
   });
 
   it('returns 200 for valid request', async () => {
     const plan = { tasks: [{ id: '1', title: 'a', description: 'a' }, { id: '2', title: 'b', description: 'b' }], acceptance_criteria: ['x'] };
     const res = await request(app).post('/implement').send({ execId: 'e1', plan });
     expect(res.status).toBe(200);
     expect(res.body.ok).toBe(true);
     expect(res.body.files).toContain('src/app.ts');
+    expect(runMock).toHaveBeenCalledWith(expect.objectContaining({ execId: 'e1', plan }));
+  });
+
+  it('forwards validator feedback to the agent', async () => {
+    const plan = {
+      tasks: [
+        { id: '1', title: 'a', description: 'a' },
+        { id: '2', title: 'b', description: 'b', dependsOn: ['1'] }
+      ],
+      acceptance_criteria: ['x']
+    };
+    const feedback = {
+      verdict: 'FAIL' as const,
+      report: 'validator/report.json',
+      contract: {
+        failingTests: [],
+        coverage: { linesPct: 40, threshold: 80 },
+        requiredChanges: [{ summary: 'Fix tests' }],
+        generatedAt: new Date().toISOString()
+      }
+    };
+    const res = await request(app).post('/implement').send({ execId: 'exec-feedback', plan, validatorFeedback: feedback });
+    expect(res.status).toBe(200);
+    expect(runMock).toHaveBeenCalledWith(expect.objectContaining({ feedback }));
   });
 
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
diff --git a/packages/implementer/src/agent.ts b/packages/implementer/src/agent.ts
index cce6ada84d50bc790999ae5b6877dd9fac9d9805..4e18219c268fa3473826772f13f6b838932d66f9 100644
--- a/packages/implementer/src/agent.ts
+++ b/packages/implementer/src/agent.ts
@@ -1,143 +1,154 @@
 import type { Logger } from '@autonomous/shared/src/logger';
 import type { Plan } from '@autonomous/shared/src/plan';
 import type { Vfs, VfsFileEntry } from '@autonomous/shared/src/vfs';
+import type { ValidatorRemediationContract } from '@autonomous/shared/src/validatorContract';
 import type { Langfuse } from 'langfuse';
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
+  feedback?: ValidatorFeedback;
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
 
+type ValidatorFeedback = {
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
 
         if (choice.finish_reason === 'tool_calls' && message.tool_calls) {
           // Push assistant's message with tool_calls before adding tool results
           messages.push(message);
           toolCallsObserved = true;
           await this.handleToolCalls(message.tool_calls, toolExecutor, messages, input);
           continue;
         }
 
         if (choice.finish_reason === 'stop') {
           const files = await this.collectFiles(toolExecutor.getTouchedPaths());
           trace?.generation?.({
             name: 'implementer.result',
             model: this.deps.model,
-            input: input.plan,
+            input: { plan: input.plan, feedback: input.feedback },
             output: { files, summary: message.content }
           });
           return { ok: true, files, summary: message.content };
         }
 
         if (message.content) {
           messages.push({ role: 'assistant', content: message.content });
         }
       } catch (err) {
         // Catch all errors in this iteration (OpenAI API errors, tool execution errors, etc)
         const e = err as Error;
         this.deps.logger.warn({ iteration: i, err: e.message }, 'iteration failed; attempting partial handoff');
         await this.ensureScaffold(input);
         const listed = await this.deps.vfs.listFiles('code/').catch(() => [] as VfsFileEntry[]);
         const files = listed.map((e) => e.path).sort();
         await this.deps.publisher.publish({
           type: 'implementer.partial',
           status: 'implementer_partial',
           reason: 'tool_error',
           files,
           artifact_prefix: `${input.execId}/code`
         });
         return { ok: true, files, summary: 'partial' };
       }
     }
@@ -214,41 +225,72 @@ export class ImplementerAgent {
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
     const appTs = `export function hello(name: string): string { return \`Hello, \${name}!\`; }\n`;
     await this.deps.vfs.writeFile('code/README.md', readme, { contentType: 'text/markdown' });
     await this.deps.vfs.writeFile('code/app.ts', appTs, { contentType: 'text/plain' });
   }
 }
 
-function buildUserPrompt(plan: Plan) {
-  return [
+function buildUserPrompt(plan: Plan, feedback?: ValidatorFeedback) {
+  const lines = [
     'Execute the following implementation plan. Return DONE when satisfied.',
     'Plan JSON:',
     JSON.stringify(plan, null, 2)
-  ].join('\n');
+  ];
+  if (feedback && feedback.verdict === 'FAIL' && feedback.contract) {
+    lines.push('\nValidator verdict: FAIL. Address the following remediation items before responding with DONE.');
+    const { contract } = feedback;
+    if (contract.requiredChanges.length > 0) {
+      lines.push('Required changes:');
+      for (const change of contract.requiredChanges) {
+        const details = change.details ? ` - Details: ${change.details}` : '';
+        lines.push(`- ${change.summary}${details}`);
+        if (Array.isArray(change.blockers) && change.blockers.length > 0) {
+          lines.push(`  Blockers: ${change.blockers.join('; ')}`);
+        }
+      }
+    }
+    if (contract.failingTests.length > 0) {
+      lines.push('Failing tests to fix:');
+      for (const test of contract.failingTests) {
+        const message = test.message ? ` :: ${test.message}` : '';
+        lines.push(`- ${test.file} :: ${test.test}${message}`);
+      }
+    }
+    if (feedback.report) {
+      lines.push(`Validator report artifact: ${feedback.report}`);
+    }
+    if (feedback.junitObject) {
+      lines.push(`JUnit results: ${feedback.junitObject}`);
+    }
+    if (feedback.coverageObject) {
+      lines.push(`Coverage summary: ${feedback.coverageObject}`);
+    }
+  }
+  return lines.join('\n');
 }
 
 function parseArgs(call: ChatCompletionToolCall): unknown {
   const raw = call.function.arguments || '{}';
   try {
     return JSON.parse(raw);
   } catch {
     return {};
   }
 }
diff --git a/packages/implementer/src/server.ts b/packages/implementer/src/server.ts
index d2c20e36e3717a9fb1a1adf0a68f3524b79c66be..10329da59b906668f368a58d56463926bb50311a 100644
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
 import { startOtel } from '@autonomous/shared/src/otel';
 import { getLangfuse } from '@autonomous/shared/src/langfuse';
+import { ValidatorRemediationContractSchema } from '@autonomous/shared/src/validatorContract';
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
+  validatorFeedback: ValidatorFeedbackSchema.optional()
 });
 
 app.post('/implement', async (req: Request, res: Response) => {
   const parseResult = RequestSchema.safeParse(req.body);
   if (!parseResult.success) {
     return res.status(400).json({ error: 'invalid request', details: parseResult.error.issues });
   }
-  const { execId, plan } = parseResult.data;
+  const { execId, plan, validatorFeedback } = parseResult.data;
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
+    const result = await agent.run({ execId, plan: advisoryPlan, feedback: validatorFeedback ?? undefined });
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
index 6fea3009a39675c269ff2a7a90cfe186460f2613..c4932efe89cba3c533bb28cca4fffcddec5c7b35 100644
--- a/packages/mca/src/__tests__/server.test.ts
+++ b/packages/mca/src/__tests__/server.test.ts
@@ -36,52 +36,54 @@ const defaultValidatorPayload: ValidatorPayload = {
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
+        coverageObject: 'runner/coverage.json',
+        junitObjectAbsolute: `${body.execId}/runner/junit.xml`,
+        coverageObjectAbsolute: `${body.execId}/runner/coverage.json`
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
index a17b276ff26d4f1279b405774cee06041e750eef..9df987f617a47573dbba66f0673b63f9b6d2c02e 100644
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
+      validatorFeedback: state.last_validator_feedback
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
index 71fc2cfc93e0a98a258fc1bd40d70d0dfb157f75..7177e8689d30a973901aa62e33f17d28d564f9f4 100644
--- a/packages/runner/src/agent.ts
+++ b/packages/runner/src/agent.ts
@@ -1,109 +1,120 @@
 type MinimalLogger = { info: Function; error: Function };
 import { publish, publishWithTrace, createVfs } from './compat';
 import type { Vfs, VfsFileEntry } from '@autonomous/shared/src/vfs';
 import { z } from 'zod';
 
 
 export const RunRequestSchema = z.object({
   execId: z.string().min(1)
 });
 
 export type RunRequest = z.infer<typeof RunRequestSchema>;
 
 export type RunResult = {
   ok: boolean;
-  junitObject?: string; // path in MinIO
-  coverageObject?: string; // path in MinIO
+  junitObject?: string; // path in MinIO relative to execution prefix
+  coverageObject?: string; // path in MinIO relative to execution prefix
+  junitObjectAbsolute?: string; // fully qualified object key for external consumers
+  coverageObjectAbsolute?: string; // fully qualified object key for external consumers
   error?: string;
 };
 
 // E2B SDK types (simplified for our usage)
 type CommandResult = { exitCode: number; stdout: string; stderr: string };
 type SandboxApi = {
   files: {
     makeDir: (path: string, opts?: { recursive?: boolean }) => Promise<boolean>;
     write: (path: string, content: string | Uint8Array) => Promise<void>;
     read: (path: string, opts?: { format?: 'text' | 'bytes' }) => Promise<string | Uint8Array>;
   };
   commands: {
     run: (cmd: string, opts?: { args?: string[]; cwd?: string; env?: Record<string, string> }) => Promise<CommandResult>;
   };
   kill?: () => Promise<void>;
 };
 
 type VitestTestCase = { name?: string; testFilePath?: string; status?: string; duration?: number; error?: { message?: string } };
 type VitestJson = { numTotalTests?: number; numPassedTests?: number; duration?: number; testResults?: VitestTestCase[] };
 
 export class RunnerAgent {
   constructor(private readonly logger: MinimalLogger) {}
 
   async run(input: RunRequest): Promise<RunResult> {
     const { execId } = input;
     await publish(execId, 'agent', { agent: 'runner', status: 'working' });
 
     const vfs = (await createVfs(execId)) as unknown as Vfs;
     // Collect code files from MinIO (current code/ root)
     const files = await vfs.listFiles();
     const codeFiles = files.filter((f: VfsFileEntry) => f.path.startsWith('code/'));
     if (codeFiles.length === 0) {
       return { ok: false, error: 'no code files found for execId' };
     }
 
     // Start sandbox
     const apiKey = process.env.E2B_API_KEY;
     if (!apiKey) {
       this.logger.error('E2B_API_KEY is not set');
       return { ok: false, error: 'E2B_API_KEY is not configured' };
     }
-  const { Sandbox }: typeof import('@e2b/sdk') = await import('@e2b/sdk');
-  // Create real E2B sandbox using node:lts template with API key
-  // The SDK handles full RPC communication for filesystem and command execution
-  // CRITICAL: Template is positional first parameter, not in options object
-  const sandboxObj = await (Sandbox as any).create('node:lts', { apiKey });
-  const sandbox: SandboxApi = sandboxObj as unknown as SandboxApi;
-
-  // Log sandbox metadata for observability
-  try {
-    const meta: any = sandboxObj;
-    this.logger.info({
-      sandboxId: meta.sandboxId,
-      envdVersion: meta.envdVersion,
-      hasEnvdApi: Boolean(meta.envdApi)
-    }, 'E2B sandbox created successfully');
-  } catch (e) {
-    this.logger.error({ err: (e as Error).message }, 'failed to read sandbox metadata');
-  }
+    const { Sandbox }: typeof import('@e2b/sdk') = await import('@e2b/sdk');
+    // Create real E2B sandbox using node:lts template with API key
+    // The SDK handles full RPC communication for filesystem and command execution
+    // CRITICAL: Template is positional first parameter, not in options object
+    const sandboxObj = await (Sandbox as any).create('node:lts', { apiKey });
+    const sandbox: SandboxApi = sandboxObj as unknown as SandboxApi;
+
+    // Log sandbox metadata for observability
     try {
-        // Publish sandbox metadata as an artifact so it's visible in the execution SSE
-        try {
-          // eslint-disable-next-line @typescript-eslint/no-explicit-any
-          const metaAny: any = sandboxObj;
-          await publishWithTrace(execId, 'artifact', { type: 'sandbox_meta', meta: { envdVersion: metaAny.envdVersion, hasEnvdApi: Boolean(metaAny.envdApi), sandboxId: metaAny.sandboxId } });
-        } catch (pubErr) {
-          this.logger.error({ err: (pubErr as Error).message }, 'failed to publish sandbox metadata');
-        }
+      const meta: any = sandboxObj;
+      this.logger.info({
+        sandboxId: meta.sandboxId,
+        envdVersion: meta.envdVersion,
+        hasEnvdApi: Boolean(meta.envdApi)
+      }, 'E2B sandbox created successfully');
+    } catch (e) {
+      this.logger.error({ err: (e as Error).message }, 'failed to read sandbox metadata');
+    }
+
+    try {
+      // Publish sandbox metadata as an artifact so it's visible in the execution SSE
+      try {
+        // eslint-disable-next-line @typescript-eslint/no-explicit-any
+        const metaAny: any = sandboxObj;
+        await publishWithTrace(execId, 'artifact', {
+          type: 'sandbox_meta',
+          meta: {
+            envdVersion: metaAny.envdVersion,
+            hasEnvdApi: Boolean(metaAny.envdApi),
+            sandboxId: metaAny.sandboxId
+          }
+        });
+      } catch (pubErr) {
+        this.logger.error({ err: (pubErr as Error).message }, 'failed to publish sandbox metadata');
+      }
+
       // Prepare a project directory
       const projectRoot = '/project';
       await sandbox.files.makeDir(projectRoot);
       await sandbox.files.makeDir(`${projectRoot}/src`);
 
       // Write minimal project files
       const pkg = {
         name: 'runner-project',
         version: '1.0.0',
         type: 'module',
         scripts: {
           test: 'vitest run --coverage --reporter=json'
         },
         devDependencies: {
           typescript: '^5.6.3',
           vitest: '^2.1.4',
           '@vitest/coverage-v8': '^2.1.4',
           tsx: '^4.19.0',
           '@types/node': '^22.7.4',
           '@types/express': '^4.17.21'
         },
         dependencies: {
           express: '^4.19.2'
         }
       };
@@ -122,67 +133,83 @@ export class RunnerAgent {
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
       // Run tests and capture JSON reporter output
       const testResult = await this.runCommand(sandbox, projectRoot, 'npm run test --silent');
 
       // Save raw JSON reporter to MinIO for audit
       const vitestJsonObject = `runner/vitest-results.json`;
       await vfs.writeFile(vitestJsonObject, testResult.stdout);
 
       // Convert to JUnit XML (simple adapter: one testsuite)
       const junitXml = this.vitestJsonToJUnit(testResult.stdout);
-      const junitObject = `runner/junit.xml`;
-      await vfs.writeFile(junitObject, junitXml, { contentType: 'application/xml' });
+      const junitRelative = `runner/junit.xml`;
+      await vfs.writeFile(junitRelative, junitXml, { contentType: 'application/xml' });
 
       // Read coverage summary from sandbox
       const coverageSummaryPath = `${projectRoot}/coverage/coverage-summary.json`;
       let coverageJson: string;
       try {
         coverageJson = await sandbox.files.read(coverageSummaryPath, { format: 'text' }) as string;
       } catch (e) {
         return { ok: false, error: 'coverage summary not found' };
       }
-      const coverageObject = `runner/coverage-summary.json`;
-      await vfs.writeFile(coverageObject, coverageJson);
+      const coverageRelative = `runner/coverage.json`;
+      await vfs.writeFile(coverageRelative, coverageJson, { contentType: 'application/json' });
 
-      await publish(execId, 'artifact', { type: 'runner_results', junit: junitObject, coverage: coverageObject });
+      const junitObject = `${execId}/${junitRelative}`;
+      const coverageObject = `${execId}/${coverageRelative}`;
+
+      await publish(execId, 'artifact', {
+        type: 'runner_results',
+        junit: junitRelative,
+        coverage: coverageRelative,
+        artifact_prefix: `${execId}/runner`,
+        junit_object: junitObject,
+        coverage_object: coverageObject
+      });
       await publish(execId, 'agent', { agent: 'runner', status: 'completed' });
-      return { ok: true, junitObject, coverageObject };
+      return {
+        ok: true,
+        junitObject: junitRelative,
+        coverageObject: coverageRelative,
+        junitObjectAbsolute: junitObject,
+        coverageObjectAbsolute: coverageObject
+      };
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
 
   private async runCommand(sandbox: SandboxApi, cwd: string, cmd: string): Promise<CommandResult> {
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
           // Command returned non-zero exit code
           const output = `stdout:\n${result.stdout}\n\nstderr:\n${result.stderr}`;
           this.logger.error({
diff --git a/packages/runner/src/server.test.ts b/packages/runner/src/server.test.ts
index 5b448e25fae1e3bea2dc65441c4edac0390b79a0..d604959ce4b06ef96dda32d920e8adfd1c89a0f4 100644
--- a/packages/runner/src/server.test.ts
+++ b/packages/runner/src/server.test.ts
@@ -1,80 +1,119 @@
 import { describe, it, expect, vi, beforeEach } from 'vitest';
 import request from 'supertest';
 import * as vfsMod from '@autonomous/shared/src/vfs';
 import * as events from '@autonomous/shared/src/events';
 
+vi.mock('@autonomous/shared/src/events', () => ({
+  publish: vi.fn(async () => {}),
+  publishWithTrace: vi.fn(async () => {}),
+  redisPub: { ping: vi.fn().mockResolvedValue('PONG') },
+  redisSub: { ping: vi.fn().mockResolvedValue('PONG') }
+}));
+
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
+  get(path: string) {
+    return this.store.get(path);
+  }
 }
 
 // Fake sandbox API updated to match agent.ts API shape
 class FakeSandbox {
+  static async create() {
+    return new FakeSandbox();
+  }
   files = {
     makeDir: async () => true,
     write: async () => {},
     read: async (p: string) => {
       if (p.endsWith('coverage/coverage-summary.json')) return JSON.stringify({ total: { lines: { pct: 100 } } });
       throw new Error('nf');
     }
   };
   commands = {
     run: async (_cmd: string, _opts?: { args?: string[]; cwd?: string; env?: Record<string, string> }) => ({
       exitCode: 0,
       stdout: JSON.stringify({ numTotalTests: 1, numPassedTests: 1, duration: 10, testResults: [{ name: 'ok', status: 'pass', duration: 10 }] }),
       stderr: ''
     })
   };
   async kill() {}
 }
 
 vi.mock('@e2b/sdk', () => ({ Sandbox: FakeSandbox }));
 let app: import('express').Express;
+let execVfs: MemVfs;
+let publishSpy: vi.MockedFunction<typeof events.publish>;
+let publishWithTraceSpy: vi.MockedFunction<typeof events.publishWithTrace>;
 
 describe('runner server', () => {
   beforeEach(() => {
     process.env.E2B_API_KEY = 'test-key';
-    vi.restoreAllMocks();
-    vi.spyOn(events, 'publish').mockResolvedValue();
-    vi.spyOn(vfsMod, 'createVfs').mockResolvedValue(
-      new MemVfs() as unknown as Awaited<ReturnType<typeof vfsMod.createVfs>>
-    );
+    vi.clearAllMocks();
+    publishSpy = vi.mocked(events.publish);
+    publishWithTraceSpy = vi.mocked(events.publishWithTrace);
+    publishSpy.mockClear();
+    publishWithTraceSpy.mockClear();
+    execVfs = new MemVfs();
+    vi.spyOn(vfsMod, 'createVfs').mockImplementation(async (execId: string, opts?: { prefixSuffix?: string }) => {
+      if (execId === 'x' && !opts?.prefixSuffix) {
+        return execVfs as unknown as Awaited<ReturnType<typeof vfsMod.createVfs>>;
+      }
+      return new MemVfs() as unknown as Awaited<ReturnType<typeof vfsMod.createVfs>>;
+    });
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
+    expect(res.body.junitObject).toBe('runner/junit.xml');
+    expect(res.body.coverageObject).toBe('runner/coverage.json');
+    expect(res.body.junitObjectAbsolute).toBe('x/runner/junit.xml');
+    expect(res.body.coverageObjectAbsolute).toBe('x/runner/coverage.json');
+    expect(execVfs.get('runner/junit.xml')).toBeInstanceOf(Buffer);
+    expect(execVfs.get('runner/coverage.json')).toBeInstanceOf(Buffer);
+    const artifactCall = publishSpy.mock.calls.find(([, event]) => event === 'artifact');
+    expect(artifactCall?.[2]).toMatchObject({
+      type: 'runner_results',
+      artifact_prefix: 'x/runner',
+      junit: 'runner/junit.xml',
+      coverage: 'runner/coverage.json',
+      junit_object: 'x/runner/junit.xml',
+      coverage_object: 'x/runner/coverage.json'
+    });
+    expect(publishWithTraceSpy).toHaveBeenCalledWith('x', 'artifact', expect.any(Object));
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
 
EOF
)