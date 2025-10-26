import { NextRequest } from 'next/server';
import JSZip from 'jszip';

export const runtime = 'nodejs';

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
  } catch {}
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
  for (const p of paths) {
    try {
      const full = path.resolve(process.cwd(), evRoot, p);
      const buf = await fs.readFile(full);
      zip.file(p, buf);
    } catch {}
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
