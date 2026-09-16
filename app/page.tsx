'use client';

import { FormEvent, useEffect, useState } from 'react';

export default function SignIn() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch('/api/auth/session', { cache: 'no-store' })
      .then((response) => {
        if (response.ok) window.location.replace('/tool');
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Unable to sign in.');
      window.location.replace('/tool');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to sign in.');
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="sign-in-title">
        <div className="login-mark" aria-hidden="true">PT</div>
        <p className="login-eyebrow">Private project workspace</p>
        <h1 id="sign-in-title">Project Tools</h1>
        <p className="login-intro">Search the document library and prepare BOM or budget exports.</p>
        {message ? <p className="login-error" role="alert">{message}</p> : null}
        {checking ? (
          <div className="login-checking" role="status"><span />Checking your session…</div>
        ) : (
          <form onSubmit={submit}>
            <label htmlFor="username">Username</label>
            <input
              id="username"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              autoFocus
            />
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          </form>
        )}
        <p className="login-note">Product files, price lists, and user credentials stay on the project PC.</p>
      </section>
    </main>
  );
}
