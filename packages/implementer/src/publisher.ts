import { publish } from '@autonomous/shared/src/events';

export type ImplementerEvent =
  | { type: 'tool_call'; tool: string; args: unknown }
  | { type: 'edit.start'; path: string; tool: string }
  | { type: 'edit.complete'; path: string; tool: string; bytes: number }
  // Support legacy dotted type for tests but always publish underscore variant on the bus
  | { type: 'implementer.partial' | 'implementer_partial'; status: 'implementer_partial'; reason: 'max_iterations' | 'tool_error'; files: string[]; artifact_prefix: string };

export interface EventPublisher {
  publish(event: ImplementerEvent): Promise<void>;
}

export class RedisEventPublisher implements EventPublisher {
  constructor(private readonly execId: string) {}

  async publish(event: ImplementerEvent): Promise<void> {
    const normalizedType = (event.type === 'implementer.partial') ? 'implementer_partial' : event.type;
    await publish(this.execId, normalizedType, { ...event, type: normalizedType, execId: this.execId });
  }
}
