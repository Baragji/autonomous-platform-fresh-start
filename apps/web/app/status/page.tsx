"use client";
import { useEffect, useState } from 'react';

type Svc = { name: string; status?: number; error?: string };

export default function StatusPage() {
  const [data, setData] = useState<{ ok: boolean; services: Svc[]; perf?: any }|null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>('');

  useEffect(() => {
    let t: any; const load = async () => {
      setLoading(true);
      try { const r = await fetch('/api/status'); const j = await r.json(); setData(j); setErr(''); }
      catch (e) { setErr(String((e as Error).message)); }
      setLoading(false); t = setTimeout(load, 3000);
    }; load();
    return () => clearTimeout(t);
  }, []);

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-lg font-semibold">System Status</h1>
      {loading && <div className="opacity-70">Refreshing…</div>}
      {err && <div className="text-red-400">{err}</div>}
      {data && (
        <div className="space-y-3">
          <div className="text-sm">Overall: {data.ok ? 'OK' : 'Issues detected'}</div>
          <div className="grid grid-cols-2 gap-2">
            {data.services.map((s) => (
              <div key={s.name} className="border border-neutral-800 rounded p-2 flex items-center justify-between">
                <div>{s.name}</div>
                <div className={s.status === 200 ? 'text-emerald-400' : s.status === 503 ? 'text-yellow-400' : 'text-red-400'}>
                  {s.status ? s.status : (s.error || 'error')}
                </div>
              </div>
            ))}
          </div>
          {data.perf && (
            <div className="text-xs opacity-70">rss: {data.perf.rss} heapUsed: {data.perf.heapUsed}</div>
          )}
        </div>
      )}
    </main>
  );
}

