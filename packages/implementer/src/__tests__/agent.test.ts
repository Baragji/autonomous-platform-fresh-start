import { randomUUID } from 'crypto';
import { Client } from 'minio';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { MinioVfs, deletePrefix } from '@autonomous/vfs/minio';
import { createLogger } from '@autonomous/shared/src/logger';
import type { ImplementerEvent } from '../publisher';
import { ImplementerAgent } from '../agent';
import type { ChatCompletionResult } from '../types';

const accessKey = process.env.MINIO_ACCESS_KEY || 'minioadmin';
const secretKey = process.env.MINIO_SECRET_KEY || 'minioadmin123';
const bucket = process.env.MINIO_BUCKET || 'umca-artifacts';

let endpoint = process.env.MINIO_ENDPOINT || '';
let container: StartedTestContainer | null = null;
let client: Client;
let minioAvailable = true;
const ENFORCE = process.env.CI_ENFORCE_INTEGRATION === '1';

function createClient(url: string) {
  const parsed = new URL(url);
  return new Client({
    endPoint: parsed.hostname,
    port: Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 9000)),
    useSSL: parsed.protocol === 'https:',
    accessKey,
    secretKey
  });
}

async function ensureBucket() {
  try {
    await client.makeBucket(bucket, 'us-east-1');
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== 'BucketAlreadyOwnedByYou' && code !== 'BucketAlreadyExists') {
      throw err;
    }
  }
}

describe('ImplementerAgent', () => {
  const prefixes: string[] = [];

  beforeAll(async () => {
    try {
      if (!endpoint) {
        container = await new GenericContainer('minio/minio')
          .withExposedPorts(9000)
          .withEnvironment({
            MINIO_ROOT_USER: accessKey,
            MINIO_ROOT_PASSWORD: secretKey
          })
          .withCommand(['server', '/data'])
          .withWaitStrategy(Wait.forLogMessage('API: http://0.0.0.0:9000'))
          .start();
        endpoint = `http://${container.getHost()}:${container.getMappedPort(9000)}`;
      }
      client = createClient(endpoint);
      await ensureBucket();
    } catch (err) {
      minioAvailable = false;
      if (container) {
        await container.stop().catch(() => {});
        container = null;
      }
      const msg = `MinIO unavailable for Implementer tests: ${(err as Error).message}`;
      if (ENFORCE) throw new Error(msg);
      process.stderr.write(`${msg}\n`);
    }
  });

  afterAll(async () => {
    if (minioAvailable) {
      for (const prefix of prefixes) {
        await deletePrefix(client, bucket, prefix).catch(() => {});
      }
    }
    if (container) {
      await container.stop().catch(() => {});
    }
  });

  it('executes tool calls and writes files to VFS', async () => {
    if (!minioAvailable) {
      process.stderr.write('MinIO unavailable; skipping implementer agent test\n');
      return;
    }
    const prefix = `tests/implementer-${randomUUID()}`;
    prefixes.push(prefix);
    const vfs = new MinioVfs({ client, bucket, prefix });
    const calls: ChatCompletionResult[] = [
      {
        id: 'cmpl-test',
        choices: [
          {
            finish_reason: 'tool_calls',
            index: 0,
            message: {
              role: 'assistant',
              content: null,
              refusal: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'create',
                    arguments: JSON.stringify({ path: 'src/app.ts', content: 'console.log("ok")\n' })
                  }
                }
              ]
            }
          }
        ],
        created: Date.now() / 1000,
        model: 'test-model',
        object: 'chat.completion'
      } as ChatCompletionResult,
      {
        id: 'cmpl-test-2',
        choices: [
          {
            finish_reason: 'stop',
            index: 0,
            message: { role: 'assistant', content: 'DONE', refusal: null }
          }
        ],
        created: Date.now() / 1000,
        model: 'test-model',
        object: 'chat.completion'
      } as ChatCompletionResult
    ];

    const openAiStub: { chat: { completions: { create: (_params: unknown) => Promise<ChatCompletionResult> } } } = {
      chat: {
        completions: {
          create: async () => {
            const next = calls.shift();
            if (!next) throw new Error('no more calls');
            return next;
          }
        }
      }
    };

    const events: ImplementerEvent[] = [];
    const publisher = { publish: async (event: ImplementerEvent) => { events.push(event); } };

    const agent = new ImplementerAgent({
      client: openAiStub,
      vfs,
      publisher,
      logger: createLogger('implementer-test'),
      model: 'test-model'
    });

    const plan = {
      tasks: [
        { id: '1', title: 'Create file', description: 'Create app.ts' },
        { id: '2', title: 'Add logic', description: 'Add console log', dependsOn: ['1'] }
      ],
      acceptance_criteria: ['File exists']
    };

    const result = await agent.run({ execId: 'exec-123', plan });
    expect(result.ok).toBe(true);
    expect(result.files).toContain('src/app.ts');
    const buf = await vfs.readFile('src/app.ts');
    expect(buf.toString()).toContain('console.log("ok")');
    expect(events.some((e) => e.type === 'tool_call')).toBe(true);
    expect(events.filter((e) => e.type === 'edit.start')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'edit.complete')).toHaveLength(1);
  });
});
