import fs from 'node:fs';
import path from 'node:path';

function ensureDir(p: string) { fs.mkdirSync(p, { recursive: true }); }
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  const outDir = path.resolve('.automation', 'evidence');
  ensureDir(outDir);
  const intent = process.env.EVIDENCE_INTENT || 'Build a TODO API with tests';
  const request_ts = new Date().toISOString();
  const reqBody = { intent };
  const initial = await fetch('http://localhost:3030/api/executions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reqBody) });
  const initialStatus = initial.status;
  const initialJson = await initial.json().catch(() => ({}));
  const id: string = String((initialJson as any).id || '');
  const trace: Array<{ ts: string; phase: string; data?: unknown }> = [];
  if (id) {
    const deadline = Date.now() + 1000 * 60 * 3; let lastStatus = '';
    while (Date.now() < deadline) {
      try { const r = await fetch(`http://localhost:3030/api/executions/${id}`); const j = await r.json(); const status = String(j.status || 'unknown'); if (status !== lastStatus) { trace.push({ ts: new Date().toISOString(), phase: status, data: j }); lastStatus = status; if (['validated','needs_remediation','failed'].includes(status)) break; } } catch {}
      await sleep(1000);
    }
  }
  const payload = { request: { ts_utc: request_ts, url: 'http://localhost:3030/api/executions', body: reqBody }, response: { http_status: initialStatus, body: initialJson }, execId: id || null, execution_trace: trace };
  fs.writeFileSync(path.join(outDir, 'e2e_request_response.json'), JSON.stringify(payload, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });

