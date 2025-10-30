import { NextRequest } from 'next/server';
import JSZip from 'jszip';

export const runtime = 'nodejs';

function isInside(root: string, target: string, pathMod: typeof import('node:path')): boolean {
  const rel = pathMod.relative(root, target);
  return !!rel && !rel.startsWith('..') && !pathMod.isAbsolute(rel);
}

export async function GET() {
  // Evidence-mode artifact listing: list evidence files as a placeholder
  const evRoot = process.env.UI_EVIDENCE_DIR || '../../.automation/evidence';
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const dir = path.resolve(process.cwd(), evRoot);
  let entries: Array<{ path: string; size: number }> = [];
  try {
    const files = await fs.readdir(dir);
    for (const f of files) {
      const full = path.join(dir, f);
      const st = await fs.stat(full);
      if (st.isFile()) entries.push({ path: f, size: st.size });
    }
  } catch (err) {
    const e = err as Error;
    // Surface directory listing errors to the caller and log for diagnostics
    console.error({ err: e.message, dir }, 'failed to list evidence directory');
    return Response.json({ error: e.message }, { status: 502 });
  }
  return Response.json({ entries });
}

export async function POST(req: NextRequest) {
  // Body: { paths: string[] } relative to evidence dir in evidence mode
  const body = await req.json().catch(() => ({}));
  const paths: string[] = Array.isArray(body?.paths) ? body.paths : [];
  const zip = new JSZip();
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const evRoot = process.env.UI_EVIDENCE_DIR || '../../.automation/evidence';
  const root = path.resolve(process.cwd(), evRoot);

  for (const p of paths) {
    try {
  const normalized = path.posix.normalize(String(p).replace(/\\\\/g, '/'));
      if (normalized.includes('..')) {
        continue; // skip unsafe
      }
      const full = path.resolve(root, normalized);
      if (!isInside(root, full, path)) {
        continue; // skip outside
      }
      const buf = await fs.readFile(full);
      zip.file(normalized, buf);
    } catch (err) {
      const e = err as Error;
      // Log read failure and collect details so we can return an error instead of silently succeeding
      console.error({ err: e.message, path: p }, 'failed to read artifact file');
      // Return an error to the caller rather than producing a partial archive
      return Response.json({ error: `failed to read ${String(p)}: ${e.message}` }, { status: 502 });
    }
  }
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(buf));
      controller.close();
    }
  });
  return new Response(stream, {
    headers: {
      'Content-Disposition': 'attachment; filename="artifacts.zip"'
    }
  });
}
