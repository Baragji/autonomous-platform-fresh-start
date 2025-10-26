import fetch from 'node-fetch';

type Entry = { name: string; url: string };

async function check(url: string) {
  try { const r = await fetch(url); return { status: r.status }; }
  catch (e) { return { error: (e as Error).message }; }
}

async function main() {
  const targets: Entry[] = [
    { name: 'gateway', url: 'http://localhost:3030/healthz' },
    { name: 'mca', url: 'http://localhost:7010/healthz' },
    { name: 'planner', url: 'http://localhost:7020/healthz' },
    { name: 'implementer', url: 'http://localhost:7030/healthz' },
    { name: 'runner', url: 'http://localhost:7040/healthz' },
    { name: 'validator', url: 'http://localhost:7050/healthz' },
    { name: 'ui', url: 'http://localhost:4000' }
  ];
  const results: Record<string, unknown> = {};
  for (const t of targets) {
    const res = await check(t.url);
    results[t.name] = res;
  }
  const allOk = Object.entries(results).every(([k, v]) => k === 'ui' ? (v as any).status === 200 : ((v as any).status === 200 || (v as any).status === 503));
  console.log(JSON.stringify({ ok: allOk, services: results }, null, 2));
  if (!allOk) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });

