'use client';

import { useCallback, useEffect, useState } from 'react';

type Trace = {
  id: string; kind: string; request_id: string; correlation_id: string;
  direction: string; method: string | null; path: string | null; outcome: string;
  details: Record<string, unknown>; created_at: string;
};

export default function TracesPage() {
  const [slug, setSlug] = useState('');
  const [traces, setTraces] = useState<Trace[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/system/traces?slug=${encodeURIComponent(slug)}`);
      if (!response.ok) { setError('Failed to load traces'); return; }
      const body = await response.json();
      setTraces(body.traces ?? []);
    } catch {
      setError('Failed to load traces');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    const timer = setTimeout(() => load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  return <main className="trace-ui">
    <header className="trace-header">
      <h1>OCPI Trace Explorer</h1>
      <div className="trace-controls">
        <label>Environment slug</label>
        <input value={slug} onChange={e => setSlug(e.target.value)} placeholder="e.g. abcdefghijkl" />
        <button disabled={loading} onClick={load}>{loading ? 'Loading…' : 'Load traces'}</button>
      </div>
    </header>
    {error && <p className="trace-error">{error}</p>}
    <div className="trace-table-wrap">
      <table>
        <thead>
          <tr><th>Created</th><th>Kind</th><th>Direction</th><th>Method</th><th>Path</th><th>Outcome</th><th>Correlation ID</th><th>Details</th></tr>
        </thead>
        <tbody>
          {traces.map(trace => (
            <tr key={trace.id}>
              <td>{new Date(trace.created_at).toLocaleString()}</td>
              <td>{trace.kind}</td>
              <td>{trace.direction}</td>
              <td>{trace.method ?? '—'}</td>
              <td>{trace.path ?? '—'}</td>
              <td>{trace.outcome}</td>
              <td>{trace.correlation_id}</td>
              <td><button>View</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </main>;
}
