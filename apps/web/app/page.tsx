"use client";
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function Page() {
  const r = useRouter();
  const [intent, setIntent] = useState('Build a TODO API with CRUD and tests');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ intent }) });
      const j = await res.json();
      const id = j?.id || String(Date.now());
      r.push(`/session/${encodeURIComponent(id)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="space-y-6">
      <div className="card">
        <div className="card-header">New Request</div>
        <div className="card-body">
          <form onSubmit={onSubmit} className="space-y-3">
            <textarea className="w-full h-28 rounded-md bg-neutral-800 p-3 outline-none" value={intent} onChange={(e) => setIntent(e.target.value)} />
            <button disabled={loading} className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50">{loading ? 'Starting…' : 'Run'}</button>
          </form>
          <div className="mt-4 text-sm opacity-70">Examples: “Build a TODO API with CRUD and JWT”, “Add pagination to users endpoint”</div>
        </div>
      </div>
    </main>
  );
}

