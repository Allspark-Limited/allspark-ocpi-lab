'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveSession } from '@/lib/session';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error ?? 'Authentication failed.');
      setBusy(false);
      return;
    }
    if (mode === 'register') {
      const loginResponse = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const loginBody = await loginResponse.json();
      if (!loginResponse.ok) {
        setError('Registered. Please log in.');
        setMode('login');
        setBusy(false);
        return;
      }
      saveSession(loginBody.sessionToken);
    } else {
      saveSession(body.sessionToken);
    }
    router.push('/');
  }

  return <main className="auth-page">
    <div className="auth-card">
      <h1>{mode === 'login' ? 'Sign in' : 'Create account'}</h1>
      <p className="auth-sub">Access your OCPI lab environments</p>
      <form onSubmit={submit}>
        <div className="field wide">
          <label>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email"/>
        </div>
        <div className="field wide">
          <label>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={mode === 'register' ? 8 : 1} autoComplete={mode === 'login' ? 'current-password' : 'new-password'}/>
        </div>
        <button disabled={busy}>{busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Register'} <span>→</span></button>
      </form>
      {error && <p className="error">{error}</p>}
      <p className="auth-switch">
        {mode === 'login' ? (
          <>No account? <button type="button" className="link" onClick={() => { setMode('register'); setError(''); }}>Register</button></>
        ) : (
          <>Have an account? <button type="button" className="link" onClick={() => { setMode('login'); setError(''); }}>Sign in</button></>
        )}
      </p>
    </div>
  </main>;
}
