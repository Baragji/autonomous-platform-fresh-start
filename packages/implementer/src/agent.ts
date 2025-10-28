import type { Logger } from '@autonomous/shared/src/logger';
import type { Plan } from '@autonomous/shared/src/plan';
import type { Vfs, VfsFileEntry } from '@autonomous/shared/src/vfs';
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
      { role: 'user', content: buildUserPrompt(input.plan) }
    ] as ChatCompletionMessage[];

    const trace = this.createTrace(input);

    const maxIterations = this.deps.maxIterations ?? 8;
    let toolCallsObserved = false;
    for (let i = 0; i < maxIterations; i += 1) {
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
      } catch (e) {
        // Model/API error: ensure scaffold and gracefully hand off partial
        this.deps.logger.warn({ err: (e as Error).message }, 'openai call failed; ensuring scaffold and handing off partial');
        await this.ensureScaffold(input);
        const listed = await this.deps.vfs.listFiles('code/').catch(() => [] as VfsFileEntry[]);
        const files = listed.map((e) => e.path).sort();
        await this.deps.publisher.publish({
          type: 'implementer_partial',
          status: 'implementer_partial',
          reason: 'tool_error',
          files,
          artifact_prefix: `${input.execId}/code`
        });
        return { ok: true, files, summary: 'partial' };
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
          input: input.plan,
          output: { files, summary: message.content }
        });
        return { ok: true, files, summary: message.content };
      }

      if (message.content) {
        messages.push({ role: 'assistant', content: message.content });
      }
    }

    // Max-iterations reached. Attempt partial handoff with scaffold instead of hard abort.
    let files = await this.collectFiles(toolExecutor.getTouchedPaths());
    if (files.length === 0) {
      await this.ensureScaffold(input);
      files = await this.collectFiles(toolExecutor.getTouchedPaths());
      // If still none (e.g., scaffold wrote outside touched set), list VFS
      if (files.length === 0) {
        const listed = await this.deps.vfs.listFiles('code/').catch(() => [] as VfsFileEntry[]);
        files = listed.map((e) => e.path).sort();
      }
    }
    // Emit structured partial event (no narrative)
    await this.deps.publisher.publish({
      type: 'implementer_partial',
      status: 'implementer_partial',
      reason: 'max_iterations',
      files,
      artifact_prefix: `${input.execId}/code`
    });
    // Warn-level log for audit; do not fail pipeline
    this.deps.logger.warn({ msg: 'implementer handing off partial work after max_iterations', handoff_status: 'implementer_partial', reason: 'max_iterations' });
    return { ok: true, files, summary: 'partial' };
  }

  private async handleToolCalls(
    calls: ChatCompletionToolCall[],
    toolExecutor: ToolExecutor,
    messages: ChatCompletionMessage[],
    input: ImplementerInput
  ) {
    for (const call of calls) {
      const args = parseArgs(call);
      await this.deps.publisher.publish({ type: 'tool_call', tool: call.function.name, args });
      try {
        const result = await toolExecutor.execute(call.function.name, args);
        messages.push({ role: 'tool', content: result, tool_call_id: call.id });
      } catch (err) {
        const error = err as Error;
        this.deps.logger.error({ tool: call.function.name, err: error.message }, 'tool execution failed');
        messages.push({
          role: 'tool',
          content: JSON.stringify({ ok: false, error: error.message }),
          tool_call_id: call.id
        });
        // On tool error, ensure minimal scaffold exists so downstream always has artifacts
        try {
          await this.ensureScaffold(input);
        } catch (e) {
          this.deps.logger.warn({ err: (e as Error).message }, 'failed to ensure scaffold after tool error');
        }
      }
    }
  }

  private async collectFiles(touched: string[]): Promise<string[]> {
    if (touched.length > 0) return touched;
    const listed = await this.deps.vfs.listFiles();
    return listed.map((entry: VfsFileEntry) => entry.path).sort();
  }

  private createTrace(input: ImplementerInput): LangfuseTrace | null {
    const candidate = this.deps.langfuse;
    if (!candidate) return null;
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
    const appTs = `export function hello(name: string): string { return \`Hello, \${name}!\`; }\n`;
    await this.deps.vfs.writeFile('code/README.md', readme, { contentType: 'text/markdown' });
    await this.deps.vfs.writeFile('code/app.ts', appTs, { contentType: 'text/plain' });
  }
}

function buildUserPrompt(plan: Plan) {
  return [
    'Execute the following implementation plan. Return DONE when satisfied.',
    'Plan JSON:',
    JSON.stringify(plan, null, 2)
  ].join('\n');
}

function parseArgs(call: ChatCompletionToolCall): unknown {
  const raw = call.function.arguments || '{}';
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
