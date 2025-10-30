import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

async function loadSharedVfs() {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const candidates = [
    // When running from apps/web as CWD
    path.resolve(process.cwd(), '../../packages/shared/dist/packages/shared/src/vfs.js'),
    path.resolve(process.cwd(), 'packages/shared/dist/packages/shared/src/vfs.js')
  ];
  for (const p of candidates) {
    try {
      await fs.access(p);
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require(p) as { createVfs: (execId: string, opts?: { prefixSuffix?: string }) => Promise<{ readFile: (p: string) => Promise<Buffer> }> };
      return mod;
    } catch (err) {
      const e = err as Error;
      // Log candidate-specific diagnostic so callers can surface why VFS load failed
      console.debug({ candidate: p, err: e.message }, 'shared vfs candidate not accessible');
    }
  }
  throw new Error('shared dist not found; build shared first');
}

// Ensure a resolved path stays within a root directory
function isInside(root: string, target: string, pathMod: typeof import('node:path')): boolean {
  const rel = pathMod.relative(root, target);
  return !!rel && !rel.startsWith('..') && !pathMod.isAbsolute(rel);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId') || '';
    const filePath = searchParams.get('path') || '';
    if (!sessionId || !filePath) {
      return Response.json({ error: 'sessionId and path are required' }, { status: 400 });
    }

    const mode = process.env.UI_BACKEND_MODE || 'evidence';

    if (mode === 'live') {
      // Use shared VFS (compiled dist) to fetch content from MinIO
      const { createVfs } = await loadSharedVfs();
      const vfs = await createVfs(sessionId);
      // Accept absolute paths (e.g., 'code/README.md') or relative; do not rewrite
      const buf = await vfs.readFile(filePath);
      // Return as text for editor display
      return new Response(Buffer.from(buf).toString('utf8'), {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }

    // Evidence mode: read directly under evidence dir but enforce containment
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const evRoot = process.env.UI_EVIDENCE_DIR || '../../.automation/evidence';
    const root = path.resolve(process.cwd(), evRoot);

    // Basic traversal rejection on user input
  const normalized = path.posix.normalize(filePath.replace(/\\\\/g, '/'));
    if (normalized.includes('..')) {
      return Response.json({ error: 'invalid path' }, { status: 400 });
    }

    const full = path.resolve(root, normalized);
    if (!isInside(root, full, path)) {
      return Response.json({ error: 'path outside allowed directory' }, { status: 400 });
    }

    const buf = await fs.readFile(full);
    return new Response(Buffer.from(buf).toString('utf8'), {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  } catch (err) {
    const e = err as Error;
    return Response.json({ error: e.message }, { status: 502 });
  }
}
