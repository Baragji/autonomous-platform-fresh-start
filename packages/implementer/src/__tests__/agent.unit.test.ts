import { describe, it, expect, vi } from 'vitest';
import { ImplementerAgent } from '../agent';
import { createLogger } from '@autonomous/shared/src/logger';
import type { Vfs, VfsFileEntry, VfsVersionEntry } from '@autonomous/shared/src/vfs';
import type { Plan } from '@autonomous/shared/src/plan';
import type { ChatCompletionResult, ChatCompletionCreateParams, ChatCompletionMessage } from '../types';
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
      { id: '1', title: 'Create file', description: 'create src/app.ts' },
      { id: '2', title: 'Finish', description: 'done', dependsOn: ['1'] }
    ],
    acceptance_criteria: ['file created']
  };
}

describe('ImplementerAgent (unit)', () => {
  it('executes tool call then returns DONE', async () => {
    const calls: ChatCompletionResult[] = [
      {
        id: 'cmpl-1',
        choices: [
          {
            finish_reason: 'tool_calls',
            index: 0,
            logprobs: null,
            message: {
              role: 'assistant',
              content: null,
              refusal: null,
              tool_calls: [
                { id: 'call_1', type: 'function', function: { name: 'create', arguments: JSON.stringify({ path: 'src/app.ts', content: 'console.log("ok")\n' }) } }
              ]
            }
          }
        ],
        created: Date.now() / 1000,
        model: 'unit',
        object: 'chat.completion'
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
    const events: ImplementerEvent[] = [];
    const agent = new ImplementerAgent({
      client: openAiStub,
      vfs: memoryVfs(),
      publisher: { publish: async (e: ImplementerEvent) => { events.push(e); } },
      logger: createLogger('test'),
      model: 'unit'
    });
    const res = await agent.run({ execId: 'exec-1', plan: makePlan() as Plan });
    expect(res.ok).toBe(true);
    expect(res.files).toContain('src/app.ts');
    expect(events.some((e) => e.type === 'tool_call')).toBe(true);
  });

  it('handles tool errors and still completes', async () => {
    const calls: ChatCompletionResult[] = [
      {
        id: 'cmpl-1',
        choices: [
          {
            finish_reason: 'tool_calls',
            index: 0,
            logprobs: null,
            message: {
              role: 'assistant',
              content: null,
              refusal: null,
              tool_calls: [ { id: 'call_1', type: 'function', function: { name: 'unknown_tool', arguments: '{}' } } ]
            }
          }
        ],
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

  it('injects validator feedback into the first user prompt', async () => {
    const calls: ChatCompletionResult[] = [
      {
        id: 'cmpl-1',
        choices: [
          {
            finish_reason: 'tool_calls',
            index: 0,
            logprobs: null,
            message: {
              role: 'assistant',
              content: null,
              refusal: null,
              tool_calls: [
                { id: 'call_1', type: 'function', function: { name: 'create', arguments: JSON.stringify({ path: 'src/app.ts', content: 'console.log("ok")\n' }) } }
              ]
            }
          }
        ],
        created: Date.now() / 1000,
        model: 'unit',
        object: 'chat.completion'
      },
      {
        id: 'cmpl-2',
        choices: [
          {
            finish_reason: 'stop',
            index: 0,
            logprobs: null,
            message: { role: 'assistant', content: 'DONE', refusal: null }
          }
        ],
        created: Date.now() / 1000,
        model: 'unit',
        object: 'chat.completion'
      }
    ];
    let capturedMessages: ChatCompletionMessage[] | undefined;
    const openAiStub = {
      chat: {
        completions: {
          create: vi.fn(async (params: ChatCompletionCreateParams) => {
            capturedMessages = params.messages;
            return calls.shift()!;
          })
        }
      }
    } as unknown as { chat: { completions: { create: (p: ChatCompletionCreateParams) => Promise<ChatCompletionResult> } } };

    const feedback = {
      verdict: 'FAIL' as const,
      report: 'validator/validation-report.json',
      junitObject: 'runner/junit.xml',
      coverageObject: 'runner/coverage.json',
      contract: {
        failingTests: [
          { file: 'src/app.test.ts', test: 'adds numbers', message: 'Expected 4 received 5' }
        ],
        coverage: { linesPct: 62, threshold: 80 },
        requiredChanges: [
          { summary: 'Fix failing tests', details: 'Update addition logic so tests pass' }
        ],
        generatedAt: new Date().toISOString()
      }
    };

    const agent = new ImplementerAgent({
      client: openAiStub,
      vfs: memoryVfs(),
      publisher: { publish: async () => {} },
      logger: createLogger('test'),
      model: 'unit'
    });

    const res = await agent.run({ execId: 'exec-3', plan: makePlan() as Plan, feedback });
    expect(res.ok).toBe(true);
    expect(openAiStub.chat.completions.create).toHaveBeenCalled();
    const userMessage = capturedMessages?.find((msg) => msg.role === 'user');
    expect(userMessage?.content).toContain('Validator verdict: FAIL');
    expect(userMessage?.content).toContain('Fix failing tests');
    expect(userMessage?.content).toContain('src/app.test.ts');
    expect(userMessage?.content).toContain('validator/validation-report.json');
  });
});
