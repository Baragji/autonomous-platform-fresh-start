import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const intent = String(body?.intent || '');
  if (!intent) return NextResponse.json({ error: 'intent required' }, { status: 400 });
  const mode = process.env.UI_BACKEND_MODE || 'evidence';
  if (mode === 'live') {
    const base = process.env.UI_GATEWAY_BASE || 'http://localhost:3030';
    const r = await fetch(`${base}/api/executions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent })
    });
    const j = await r.json().catch(() => ({}));
    const id = String((j as any).id || Date.now());
    return NextResponse.json({ id });
  }
  // evidence mode: synthesize session id
  return NextResponse.json({ id: String(Date.now()) });
}

