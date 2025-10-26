import request from 'supertest';
import { describe, it, beforeEach, expect, vi } from 'vitest';

type VfsFileEntry = { path: string; size: number; lastModified: Date };

const listFilesMock = vi.fn<() => Promise<VfsFileEntry[]>>(async () => []);
const readFileMock = vi.fn<(path: string) => Promise<Buffer>>(async () => Buffer.from(''));
const writeFileMock = vi.fn<(path: string, content: Buffer | string) => Promise<void>>(async () => {});

const createVfsMock = vi.fn(async () => ({
  listFiles: listFilesMock,
  readFile: readFileMock,
  writeFile: writeFileMock,
  listVersions: async () => []
}));

vi.mock('@autonomous/shared/src/vfs', () => ({ createVfs: createVfsMock }));
const publishMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@autonomous/shared/src/events', () => ({ publish: publishMock }));

describe('validator /validate with no code files', () => {
  beforeEach(() => {
    process.env.E2B_API_KEY = 'test-key';
    createVfsMock.mockClear();
    listFilesMock.mockReset().mockResolvedValue([]);
    readFileMock.mockReset();
    writeFileMock.mockReset();
    publishMock.mockClear();
  });

  it('returns structured FAIL and writes report when no code files exist', async () => {
    const mod = await import('../src/server');
    const res = await request(mod.app).post('/validate').send({ execId: 'no-code' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.verdict).toBe('FAIL');
    expect(publishMock).toHaveBeenCalled();
  });
});

