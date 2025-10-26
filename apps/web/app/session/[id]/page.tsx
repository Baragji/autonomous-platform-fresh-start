"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';

const Monaco = dynamic(() => import('@monaco-editor/react'), { ssr: false });

type FileEntry = { path: string; size?: number; content?: string };

type EventMsg = { type: string; data: any };

export default function SessionPage() {
  const params = useParams<{ id: string }>();
  const sessionId = decodeURIComponent(params.id);
  const [events, setEvents] = useState<EventMsg[]>([]);
  const [phase, setPhase] = useState<string>('starting');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [active, setActive] = useState<string>('');
  const [loadingFile, setLoadingFile] = useState<boolean>(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const src = new EventSource(`/api/stream?sessionId=${encodeURIComponent(sessionId)}`);
    const handleMessage = (ev: MessageEvent) => {
      try {
        const payload = JSON.parse(ev.data);
        setEvents((prev) => [...prev, { type: 'message', data: payload }]);
        if (payload?.status) setPhase(payload.status);
      } catch {}
    };
    const handleStatus = (ev: MessageEvent) => {
      try {
        const payload = JSON.parse(ev.data);
        setEvents((prev) => [...prev, { type: 'status', data: payload }]);
        if (payload?.status) setPhase(payload.status);
      } catch {}
    };
    const handleAgent = (ev: MessageEvent) => {
      try { setEvents((prev) => [...prev, { type: 'agent', data: JSON.parse(ev.data) }]); } catch {}
    };
    const handleArtifact = (ev: MessageEvent) => {
      try {
        const payload = JSON.parse(ev.data);
        setEvents((prev) => [...prev, { type: 'artifact', data: payload }]);
        if (payload?.type === 'code' && Array.isArray(payload.files)) {
          setFiles((prev) => {
            const set = new Map(prev.map((f) => [f.path, f] as const));
            for (const p of payload.files as string[]) {
              if (!set.has(p)) set.set(p, { path: p });
            }
            return Array.from(set.values());
          });
        }
      } catch {}
    };
    const handleError = () => {
      setEvents((prev) => [...prev, { type: 'error', data: 'stream error' }]);
      src.close();
    };

    src.onmessage = handleMessage;
    src.addEventListener('status', handleStatus);
    src.addEventListener('agent', handleAgent);
    src.addEventListener('artifact', handleArtifact);
    src.onerror = handleError;

    return () => {
      src.removeEventListener('status', handleStatus);
      src.removeEventListener('agent', handleAgent);
      src.removeEventListener('artifact', handleArtifact);
      src.close();
    };
  }, [sessionId]);

  useEffect(() => {
    // auto-scroll logs
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [events.length]);

  const activeContent = useMemo(() => files.find((f) => f.path === active)?.content || '', [files, active]);

  // Fetch file content when active changes (live or evidence via /api/file)
  useEffect(() => {
    const fetchContent = async () => {
      if (!active) return;
      setLoadingFile(true);
      try {
        const res = await fetch(`/api/file?sessionId=${encodeURIComponent(sessionId)}&path=${encodeURIComponent(active)}`);
        if (res.ok) {
          const text = await res.text();
          setFiles((prev) => prev.map((f) => (f.path === active ? { ...f, content: text } : f)));
        }
      } catch {
        // swallow
      } finally {
        setLoadingFile(false);
      }
    };
    fetchContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, sessionId]);

  return (
    <main className="grid grid-cols-12 gap-4">
      <section className="col-span-4 space-y-4">
        <div className="card">
          <div className="card-header">Pipeline</div>
          <div className="card-body text-sm">
            <ul className="space-y-2">
              {['planned', 'implementing', 'implemented', 'tested', 'validated', 'needs_remediation', 'failed'].map((p) => (
                <li key={p} className={`flex items-center gap-2 ${phase === p ? 'text-emerald-400' : 'opacity-70'}`}>
                  <span className={`inline-block h-2 w-2 rounded-full ${phase === p ? 'bg-emerald-400' : 'bg-neutral-600'}`} />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="card">
          <div className="card-header">Files</div>
          <div className="card-body text-sm space-y-1">
            {files.length === 0 && <div className="opacity-60">No files yet…</div>}
            {files.map((f) => (
              <div key={f.path} className="flex items-center justify-between">
                <button className={`text-left hover:underline ${active === f.path ? 'text-emerald-400' : ''}`} onClick={() => setActive(f.path)}>{f.path}</button>
                <span className="opacity-50">{f.size ? `${f.size}B` : ''}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="col-span-8 space-y-4">
        <div className="card min-h-[420px]">
          <div className="card-header">Editor {active ? `— ${active}` : ''}</div>
          <div className="card-body">
            <div className="h-[360px] border border-neutral-800 rounded relative">
              {loadingFile && (
                <div className="absolute inset-0 flex items-center justify-center text-sm opacity-70">Loading…</div>
              )}
              <Monaco height="100%" language={getLanguage(active)} theme="vs-dark" value={activeContent} options={{ readOnly: true, wordWrap: 'on' }} />
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-header">Logs</div>
          <div ref={logRef} className="card-body h-48 overflow-auto text-xs whitespace-pre-wrap">
            {events.map((e, i) => (
              <div key={i} className="opacity-80">{typeof e.data === 'string' ? e.data : JSON.stringify(e.data)}</div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function getLanguage(path: string) {
  if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'typescript';
  if (path.endsWith('.js') || path.endsWith('.jsx')) return 'javascript';
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.md')) return 'markdown';
  if (path.endsWith('.yml') || path.endsWith('.yaml')) return 'yaml';
  return 'plaintext';
}
