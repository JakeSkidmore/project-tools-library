import { sameOrigin, setSessionCookie } from '@/lib/auth';
import { backendFailure, fetchFromPC } from '@/lib/backend';

export const dynamic = 'force-dynamic';

async function clientFingerprint(request: Request): Promise<string> {
  const material = [
    request.headers.get('cf-connecting-ip') || '',
    request.headers.get('user-agent') || '',
  ].join('|');
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Request rejected.' }, { status: 403 });
  try {
    const value = (await request.json()) as { username?: unknown; password?: unknown };
    const username = typeof value.username === 'string' ? value.username.trim() : '';
    const password = typeof value.password === 'string' ? value.password : '';
    if (!username || !password || username.length > 64 || password.length > 4096) {
      return Response.json({ error: 'Enter your username and password.' }, { status: 400 });
    }
    const upstream = await fetchFromPC('/__hybrid/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Project-Client': await clientFingerprint(request),
      },
      body: JSON.stringify({ username, password }),
    });
    const result = (await upstream.json()) as { error?: unknown; sessionToken?: unknown; username?: unknown };
    if (!upstream.ok) {
      const message = typeof result.error === 'string' ? result.error : 'Unable to sign in.';
      return Response.json({ error: message }, { status: upstream.status, headers: { 'Cache-Control': 'no-store' } });
    }
    if (typeof result.sessionToken !== 'string' || typeof result.username !== 'string') {
      throw new Error('The PC returned an invalid sign-in response.');
    }
    return Response.json(
      { authenticated: true, username: result.username },
      { headers: { 'Cache-Control': 'no-store', 'Set-Cookie': setSessionCookie(result.sessionToken) } },
    );
  } catch (error) {
    return backendFailure(error);
  }
}
