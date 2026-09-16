import { clearSessionCookie, sameOrigin, sessionToken } from '@/lib/auth';
import { fetchFromPC } from '@/lib/backend';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Request rejected.' }, { status: 403 });
  const token = sessionToken(request);
  if (token) {
    try {
      await fetchFromPC('/__hybrid/auth/logout', { method: 'POST' }, token);
    } catch {
      // The browser cookie is still cleared if the PC is temporarily unavailable.
    }
  }
  return Response.json(
    { authenticated: false },
    { headers: { 'Cache-Control': 'no-store', 'Set-Cookie': clearSessionCookie() } },
  );
}
