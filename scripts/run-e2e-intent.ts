import fs from 'node:fs';
import path from 'node:path';

function ensureDir(p: string) { fs.mkdirSync(p, { recursive: true }); }
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  const outDir = path.resolve('.automation', 'evidence');
  ensureDir(outDir);
  const intent = process.env.EVIDENCE_INTENT || 'Build a task API with tests';
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
  function sanitize(obj: any): any {
    try {
      const j = JSON.parse(JSON.stringify(obj));
      if (j && j.body) {
        if (j.body.id) j.body.id = 'SANITIZED';
        if (j.body.location) j.body.location = '/api/executions/SANITIZED';
        if (j.body.stream) j.body.stream = '/api/executions/SANITIZED/stream';
      }
      return j;
    } catch { return obj; }
  }
  const payload = {
    request: { ts_utc: 'STATIC', url: 'http://localhost:3030/api/executions', body: reqBody },
    response: sanitize({ http_status: initialStatus, body: initialJson }),
    // Exec ID is not a secret; keep it to allow readiness fallback to inspect VFS artifacts
    execId: id || null,
    execution_trace: trace.map((t) => ({ ts: 'STATIC', phase: t.phase }))
  };
  fs.writeFileSync(path.join(outDir, 'e2e_request_response.json'), JSON.stringify(payload, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
