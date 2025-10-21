import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();

vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation(() => ({
    query: queryMock
  }))
}));

let db: typeof import('../db');

beforeEach(async () => {
  queryMock.mockReset();
  db = await import('../db');
});

afterEach(() => {
  vi.resetModules();
});

describe('db helpers', () => {
  it('upsertExecution persists execution row', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await db.upsertExecution('exec-1', 'planning', 'Build app', 'mca');
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO executions'), [
      'exec-1',
      'Build app',
      'planning',
      'mca'
    ]);
  });

  it('getExecution returns first row', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: 'exec-2' }] });
    const row = await db.getExecution('exec-2');
    expect(queryMock).toHaveBeenCalledWith('SELECT * FROM executions WHERE id = $1', ['exec-2']);
    expect(row).toEqual({ id: 'exec-2' });
  });

  it('insertCheckpoint writes checkpoint with parent', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await db.insertCheckpoint('thread-1', 'chk-2', { status: 'planned' }, 'chk-1');
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO checkpoints'),
      ['thread-1', 'chk-2', 'chk-1', { status: 'planned' }]
    );
  });
});
