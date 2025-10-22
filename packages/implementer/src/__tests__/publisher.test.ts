import { describe, it, expect, vi } from 'vitest';
import { RedisEventPublisher } from '../publisher';

vi.mock('@autonomous/shared/src/events', () => ({ publish: vi.fn(async () => {}) }));

describe('RedisEventPublisher', () => {
  it('forwards events to shared publish', async () => {
    const { publish } = await import('@autonomous/shared/src/events');
    const p = new RedisEventPublisher('exec-1');
    await p.publish({ type: 'tool_call', tool: 'view', args: { path: 'a' } });
    await p.publish({ type: 'edit.start', path: 'a', tool: 'create' });
    await p.publish({ type: 'edit.complete', path: 'a', tool: 'create', bytes: 3 });
    const calls = (publish as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBe(3);
    expect(calls[0][0]).toBe('exec-1');
    expect(calls[0][1]).toBe('tool_call');
    expect(calls[1][1]).toBe('edit.start');
    expect(calls[2][1]).toBe('edit.complete');
  });
});

