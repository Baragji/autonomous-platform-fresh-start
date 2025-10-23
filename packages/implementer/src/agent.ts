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
      const response = await this.deps.client.chat.completions.create({
        model: this.deps.model,
        messages,
        tools: toolExecutor.tools,
        // Encourage the model to actually call tools at least once to generate artifacts
        // Then relax to auto after we observe a tool call.
        tool_choice: toolCallsObserved ? 'auto' : 'required'
      });
      const choice = response.choices[0];
      const message = choice?.message;
      if (!choice || !message) {
        throw new Error('Implementer received empty response from OpenAI');
      }

      if (choice.finish_reason === 'tool_calls' && message.tool_calls) {
        // Push assistant's message with tool_calls before adding tool results
        messages.push(message);
        toolCallsObserved = true;
        await this.handleToolCalls(message.tool_calls, toolExecutor, messages);
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

    throw new Error('Implementer exceeded maximum iterations');
  }

  private async handleToolCalls(
    calls: ChatCompletionToolCall[],
    toolExecutor: ToolExecutor,
    messages: ChatCompletionMessage[]
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
