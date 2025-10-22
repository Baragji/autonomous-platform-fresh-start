import { publish } from '@autonomous/shared/src/events';

export type ImplementerEvent =
  | { type: 'tool_call'; tool: string; args: unknown }
  | { type: 'edit.start'; path: string; tool: string }
  | { type: 'edit.complete'; path: string; tool: string; bytes: number };

export interface EventPublisher {
  publish(event: ImplementerEvent): Promise<void>;
}

export class RedisEventPublisher implements EventPublisher {
  constructor(private readonly execId: string) {}

  async publish(event: ImplementerEvent): Promise<void> {
    await publish(this.execId, event.type, { ...event, execId: this.execId });
  }
}
