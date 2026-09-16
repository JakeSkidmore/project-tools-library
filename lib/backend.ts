const FORWARDED_HEADERS = [
  'content-type',
  'content-disposition',
  'x-project-document-count',
  'x-project-packaging-milliseconds',
] as const;

function backendConfiguration() {
  const baseUrl = process.env.CRESTRON_BACKEND_URL?.replace(/\/+$/, '');
  const token = process.env.CRESTRON_BACKEND_TOKEN;
  if (!baseUrl || !token) {
    throw new Error('The PC document service is not configured.');
  }
  return { baseUrl, token };
}

export async function fetchFromPC(path: string, init: RequestInit = {}, sessionToken = '') {
  const { baseUrl, token } = backendConfiguration();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (sessionToken) headers.set('X-Project-Session', sessionToken);
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });
}

export function forwardPCResponse(upstream: Response) {
  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  const contentLength = upstream.headers.get('content-length');
  if (contentLength) headers.set('x-project-content-length', contentLength);
  headers.set('Cache-Control', 'private, no-store');
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

export function backendFailure(error: unknown) {
  const message = error instanceof Error ? error.message : 'The PC document service is unavailable.';
  return Response.json({ error: message }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}
