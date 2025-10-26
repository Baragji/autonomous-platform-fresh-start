import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId') || '';
  const mode = process.env.UI_BACKEND_MODE || 'evidence';

  if (mode === 'live') {
    const base = process.env.UI_GATEWAY_BASE || 'http://localhost:3030';
    const url = `${base}/api/executions/${encodeURIComponent(sessionId)}/stream`;
    const upstream = await fetch(url, { headers: { Accept: 'text/event-stream' } });
    const transform = new ReadableStream({
      start(controller) {
        (async () => {
          const reader = upstream.body!.getReader();
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            controller.enqueue(value!);
          }
          controller.close();
        })().catch(() => controller.close());
      }
    });
    return new Response(transform, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive'
      }
    });
  }

  // Evidence synthesizer: emit staged events from .automation/evidence
  const evRoot = process.env.UI_EVIDENCE_DIR || '../../.automation/evidence';
  // Lazy file reads to keep it simple
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const v5Path = path.resolve(process.cwd(), evRoot, 'v5-report.json');
  const e2ePath = path.resolve(process.cwd(), evRoot, 'e2e_request_response.json');

  let phases: string[] = ['planned', 'implementing', 'implemented', 'tested', 'validated'];
  try {
    const e2e = JSON.parse(await fs.readFile(e2ePath, 'utf-8')) as any;
    const trace = Array.isArray(e2e?.execution_trace) ? e2e.execution_trace : [];
    const p = trace.map((t: any) => String(t.phase || '')); if (p.length > 0) phases = p;
  } catch {}
  try {
    const v5 = JSON.parse(await fs.readFile(v5Path, 'utf-8')) as any;
    if (v5?.e2e?.touched_validator && !phases.includes('validated')) phases.push('validated');
  } catch {}

  const encoder = new TextEncoder();
  let i = 0;
  const stream = new ReadableStream({
    start(controller) {
      const timer = setInterval(() => {
        if (i >= phases.length) { clearInterval(timer); controller.close(); return; }
        const status = phases[i++];
        const payload = JSON.stringify({ status });
        controller.enqueue(encoder.encode(`event: message\n`));
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      }, 600);
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    }
  });
}

