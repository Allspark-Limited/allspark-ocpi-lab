'use client';

import { FormEvent, useState } from 'react';

type Created = {
  environment: { slug: string; name: string; role: string; scenario: string; expiresAt: string };
  tokenA: string;
};

const scenarios = [
  ['success', 'Clean handshake'], ['rejected', 'Explicit rejection'], ['timeout', 'HTTP timeout'],
  ['delayed', 'Delayed response'], ['malformed', 'Malformed envelope'],
];

export default function Home() {
  const [adminSecret, setAdminSecret] = useState('local-development-only');
  const [name, setName] = useState('My OCPI test environment');
  const [role, setRole] = useState('EMSP');
  const [scenario, setScenario] = useState('success');
  const [created, setCreated] = useState<Created | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setCreated(null);
    const response = await fetch('/api/environments', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-lab-admin-secret': adminSecret },
      body: JSON.stringify({ name, countryCode: 'IE', partyId: 'LAB', role, scenario,
        modules: ['credentials', 'locations', 'tariffs', 'tokens', 'commands', 'sessions', 'cdrs'] }),
    });
    const body = await response.json();
    if (!response.ok) setError(body.error ?? 'Could not create the environment.');
    else setCreated(body);
    setBusy(false);
  }

  const versionsUrl = created ? `${location.origin}/api/ocpi/${created.environment.slug}/versions` : '';

  return <main>
    <header className="hero">
      <nav><span className="brand"><i>⚡</i> ALLSPARK <b>OCPI LAB</b></span><span className="pill">Synthetic only</span></nav>
      <div className="heroGrid">
        <section>
          <p className="eyebrow">OCPI 2.2.1 interoperability, without the production risk</p>
          <h1>Break the handshake.<br/><em>Not your chargers.</em></h1>
          <p className="lede">Create an isolated endpoint, exchange credentials, replay deterministic failures, and export evidence your team can actually read.</p>
          <div className="promise"><span>✓ No real charging</span><span>✓ Expiring environments</span><span>✓ Sanitized receipts</span></div>
        </section>
        <aside className="protocolCard">
          <div className="dots"><span/><span/><span/></div>
          <code><b>GET</b> /versions</code><code><b>POST</b> /credentials</code><code><b>PUT</b> /locations/IE/LAB/…</code>
          <div className="trace"><small>X-Correlation-ID</small><strong>0b61…f92c</strong></div>
        </aside>
      </div>
    </header>

    <section className="workspace">
      <div className="intro"><span>01</span><div><h2>Create a lab environment</h2><p>Token A is displayed once. Tokens B and C are encrypted at rest and never appear in receipts.</p></div></div>
      <form onSubmit={create}>
        <div className="field wide"><label>Environment name</label><input value={name} onChange={e => setName(e.target.value)} maxLength={80}/></div>
        <div className="field"><label>Role</label><select value={role} onChange={e => setRole(e.target.value)}><option>EMSP</option><option>CPO</option><option>HUB</option></select></div>
        <div className="field"><label>Local admin secret</label><input type="password" autoComplete="off" value={adminSecret} onChange={e => setAdminSecret(e.target.value)}/></div>
        <fieldset><legend>Scenario</legend>{scenarios.map(([value, label]) => <label className={`scenario ${scenario === value ? 'active' : ''}`} key={value}>
          <input type="radio" name="scenario" value={value} checked={scenario === value} onChange={() => setScenario(value)}/><b>{label}</b><small>{value}</small>
        </label>)}</fieldset>
        <button disabled={busy}>{busy ? 'Creating…' : 'Create synthetic environment'} <span>→</span></button>
      </form>
      {error && <p className="error">{error}</p>}
      {created && <section className="result">
        <div className="resultHead"><span>Ready</span><p>Expires {new Date(created.environment.expiresAt).toLocaleString()}</p></div>
        <label>Versions URL</label><code>{versionsUrl}</code>
        <label>Token A · shown once</label><code>{created.tokenA}</code>
        <p>Use <strong>Authorization: Token &lt;Token A&gt;</strong> for discovery and the initial Credentials POST.</p>
      </section>}
    </section>

    <section className="how">
      <div><span>02</span><h3>Connect your implementation</h3><p>Point your eMSP, CPO, or hub at the generated Versions URL.</p></div>
      <div><span>03</span><h3>Run a deterministic fault</h3><p>Reproduce rejection, delay, timeout, and malformed-envelope handling.</p></div>
      <div><span>04</span><h3>Keep the evidence</h3><p>Correlation IDs and redacted receipts survive restarts in PostgreSQL.</p></div>
    </section>
    <footer>Open source · Synthetic data only · Not an OCPI certification authority</footer>
  </main>;
}
