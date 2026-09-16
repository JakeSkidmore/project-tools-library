import { fetchFromPC } from '@/lib/backend';

export const SESSION_COOKIE = 'project_tools_session';
export const SESSION_MAX_AGE = 12 * 60 * 60;

export function sessionToken(request: Request): string {
  const cookie = request.headers.get('cookie') || '';
  for (const part of cookie.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return '';
}

export function setSessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_MAX_AGE}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function unauthenticatedResponse(asRedirect = false): Response {
  if (asRedirect) {
    return new Response(null, {
      status: 303,
      headers: { Location: '/?expired=1', 'Set-Cookie': clearSessionCookie() },
    });
  }
  return Response.json(
    { error: 'Sign in required.' },
    { status: 401, headers: { 'Cache-Control': 'no-store', 'Set-Cookie': clearSessionCookie() } },
  );
}

export async function validateSession(request: Request): Promise<{ token: string; username: string } | null> {
  const token = sessionToken(request);
  if (!token) return null;
  const upstream = await fetchFromPC('/__hybrid/auth/session', {}, token);
  if (!upstream.ok) return null;
  const value = (await upstream.json()) as { username?: unknown };
  const username = typeof value.username === 'string' ? value.username : '';
  return username ? { token, username } : null;
}

export async function authenticatedToken(request: Request): Promise<string | null> {
  const token = sessionToken(request);
  return token || null;
}
