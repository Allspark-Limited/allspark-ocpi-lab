'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authHeaders, clearSession, getSession } from '@/lib/session';

type TraceDetail = {
  id: string; kind: string; request_id: string; correlation_id: string;
  direction: string; method: string | null; path: string | null; outcome: string;
  details: Record<string, unknown>; created_at: string;
};

export default function TraceDetailPage({ params }: { params: Promise<{ traceId: string }> }) {
  const router = useRouter();
  const [traceId, setTraceId] = useState<string | null>(null);
  const [slug, setSlug] = useState('');
  const [trace, setTrace] = useState<TraceDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    params.then(p => setTraceId(p.traceId));
  }, [params]);

  useEffect(() => {
    if (!getSession()) { router.push('/login'); return; }
    fetch('/api/auth/me', { headers: authHeaders() })
      .catch(() => { clearSession(); router.push('/login'); });
  }, [router]);

  const load = useCallback(async () => {
    if (!slug || !traceId) return;
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/system/traces/${encodeURIComponent(traceId)}?slug=${encodeURIComponent(slug)}`, { headers: authHeaders() });
      if (response.status === 401) { clearSession(); router.push('/login'); return; }
      if (!response.ok) { setError('Failed to load trace'); return; }
      const body = await response.json();
      setTrace(body.trace ?? null);
    } catch {
      setError('Failed to load trace');
    } finally {
      setLoading(false);
    }
  }, [slug, traceId, router]);

  useEffect(() => {
    const timer = setTimeout(() => load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  return <main className="trace-ui">
    <header className="trace-header">
      <h1>Trace Detail</h1>
      <div className="trace-controls">
        <label>Environment slug</label>
        <input value={slug} onChange={e => setSlug(e.target.value)} placeholder="e.g. abcdefghijkl" />
        <button disabled={loading} onClick={load}>{loading ? 'Loading…' : 'Load trace'}</button>
      </div>
    </header>
    {error && <p className="trace-error">{error}</p>}
    {trace && <div className="trace-detail">
      <table>
        <tbody>
          <tr><th>ID</th><td>{trace.id}</td></tr>
          <tr><th>Kind</th><td>{trace.kind}</td></tr>
          <tr><th>Request ID</th><td>{trace.request_id}</td></tr>
          <tr><th>Correlation ID</th><td>{trace.correlation_id}</td></tr>
          <tr><th>Direction</th><td>{trace.direction}</td></tr>
          <tr><th>Method</th><td>{trace.method ?? '—'}</td></tr>
          <tr><th>Path</th><td>{trace.path ?? '—'}</td></tr>
          <tr><th>Outcome</th><td>{trace.outcome}</td></tr>
          <tr><th>Created</th><td>{new Date(trace.created_at).toLocaleString()}</td></tr>
          <tr><th>Details</th><td><pre>{JSON.stringify(trace.details, null, 2)}</pre></td></tr>
        </tbody>
      </table>
    </div>}
  </main>;
}
