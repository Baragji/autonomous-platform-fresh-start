import type { Vfs } from '@autonomous/shared/src/vfs';
import { z } from 'zod';
import type { ChatCompletionTool } from './types';
import type { EventPublisher } from './publisher';

const viewArgs = z.object({ path: z.string().min(1) });
const createArgs = z.object({
  path: z.string().min(1),
  content: z.string(),
  contentType: z.string().optional()
});
const replaceArgs = z.object({
  path: z.string().min(1),
  find: z.string().min(1),
  replace: z.string()
});
const insertArgs = z.object({
  path: z.string().min(1),
  content: z.string(),
  after: z.string().optional(),
  before: z.string().optional()
});

export class ToolExecutor {
  readonly tools: ChatCompletionTool[];
  private readonly vfs: Vfs;
  private readonly publisher: EventPublisher;
  private readonly touched = new Set<string>();

  constructor(opts: { vfs: Vfs; publisher: EventPublisher }) {
    this.vfs = opts.vfs;
    this.publisher = opts.publisher;
    this.tools = [
      {
        type: 'function',
        function: {
          name: 'view',
          description: 'Read a file from the virtual file system.',
          parameters: {
            type: 'object',
            properties: { path: { type: 'string', description: 'Relative file path under code/' } },
            required: ['path']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'create',
          description: 'Create or overwrite a file with the provided content.',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              content: { type: 'string' },
              contentType: { type: 'string' }
            },
            required: ['path', 'content']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'str_replace',
          description: 'Replace a string within a file. Fails if the target string is missing.',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              find: { type: 'string' },
              replace: { type: 'string' }
            },
            required: ['path', 'find', 'replace']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'insert',
          description: 'Insert content before or after a marker string.',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              content: { type: 'string' },
              after: { type: 'string' },
              before: { type: 'string' }
            },
            required: ['path', 'content']
          }
        }
      }
    ];
  }

  async execute(name: string, rawArgs: unknown): Promise<string> {
    switch (name) {
      case 'view':
        return this.view(rawArgs);
      case 'create':
        return this.create(rawArgs);
      case 'str_replace':
        return this.replace(rawArgs);
      case 'insert':
        return this.insert(rawArgs);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  getTouchedPaths(): string[] {
    return Array.from(this.touched).sort();
  }

  private async view(rawArgs: unknown): Promise<string> {
    const args = viewArgs.parse(rawArgs);
    const data = await this.vfs.readFile(args.path);
    return JSON.stringify({ path: args.path, content: data.toString('utf8'), size: data.length });
  }

  private async create(rawArgs: unknown): Promise<string> {
    const args = createArgs.parse(rawArgs);
    await this.publisher.publish({ type: 'edit.start', path: args.path, tool: 'create' });
    await this.vfs.writeFile(args.path, args.content, { contentType: args.contentType });
    await this.publisher.publish({
      type: 'edit.complete',
      path: args.path,
      tool: 'create',
      bytes: Buffer.byteLength(args.content, 'utf8')
    });
    this.touched.add(args.path);
    return JSON.stringify({ ok: true, path: args.path });
  }

  private async replace(rawArgs: unknown): Promise<string> {
    const args = replaceArgs.parse(rawArgs);
    const original = (await this.vfs.readFile(args.path)).toString('utf8');
    if (!original.includes(args.find)) {
      throw new Error(`String not found: ${args.find}`);
    }
    const updated = original.split(args.find).join(args.replace);
    await this.publisher.publish({ type: 'edit.start', path: args.path, tool: 'str_replace' });
    await this.vfs.writeFile(args.path, updated);
    await this.publisher.publish({
      type: 'edit.complete',
      path: args.path,
      tool: 'str_replace',
      bytes: Buffer.byteLength(updated, 'utf8')
    });
    this.touched.add(args.path);
    return JSON.stringify({ ok: true, path: args.path, replacements: original.split(args.find).length - 1 });
  }

  private async insert(rawArgs: unknown): Promise<string> {
    const args = insertArgs.parse(rawArgs);
    const original = (await this.vfs.readFile(args.path)).toString('utf8');
    let updated = original;
    if (args.after) {
      const idx = original.indexOf(args.after);
      if (idx === -1) throw new Error(`After marker not found: ${args.after}`);
      const insertIdx = idx + args.after.length;
      updated = `${original.slice(0, insertIdx)}${args.content}${original.slice(insertIdx)}`;
    } else if (args.before) {
      const idx = original.indexOf(args.before);
      if (idx === -1) throw new Error(`Before marker not found: ${args.before}`);
      updated = `${original.slice(0, idx)}${args.content}${original.slice(idx)}`;
    } else {
      updated = `${original}${args.content}`;
    }
    await this.publisher.publish({ type: 'edit.start', path: args.path, tool: 'insert' });
    await this.vfs.writeFile(args.path, updated);
    await this.publisher.publish({
      type: 'edit.complete',
      path: args.path,
      tool: 'insert',
      bytes: Buffer.byteLength(updated, 'utf8')
    });
    this.touched.add(args.path);
    return JSON.stringify({ ok: true, path: args.path });
  }
}
