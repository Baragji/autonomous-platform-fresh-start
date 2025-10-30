import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

async function snapshot() {
  const targets = [
    { name: 'gateway', url: 'http://localhost:3030/healthz' },
    { name: 'mca', url: 'http://localhost:7010/healthz' },
    { name: 'planner', url: 'http://localhost:7020/healthz' },
    { name: 'implementer', url: 'http://localhost:7030/healthz' },
    { name: 'runner', url: 'http://localhost:7040/healthz' },
    { name: 'validator', url: 'http://localhost:7050/healthz' }
  ];
  const results: Array<{ name: string; status?: number; error?: string }> = [];
  for (const t of targets) {
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 2000).unref?.();
      const r = await fetch(t.url, { signal: ctrl.signal as any });
      results.push({ name: t.name, status: r.status });
    } catch (e) {
      results.push({ name: t.name, error: (e as Error).message });
    }
  }
  return results;
}

export async function GET(_req: NextRequest) {
  const list = await snapshot();
  const ok = list.every((x) => x.status === 200 || x.status === 503);
  const cpu = process.cpuUsage();
  const mem = process.memoryUsage();
  return Response.json({ ok, at: new Date().toISOString(), services: list, perf: { rss: mem.rss, heapUsed: mem.heapUsed, userMicros: cpu.user } });
}

