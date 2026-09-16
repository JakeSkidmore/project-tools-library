import { backendFailure, fetchFromPC, forwardPCResponse } from '@/lib/backend';
import { sameOrigin, sessionToken, unauthenticatedResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Request rejected.' }, { status: 403 });
  const session = sessionToken(request);
  if (!session) return unauthenticatedResponse();
  try {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.toLowerCase().startsWith('application/json')) {
      return Response.json({ error: 'The export request must be JSON.' }, { status: 415 });
    }
    const body = await request.arrayBuffer();
    return forwardPCResponse(
      await fetchFromPC('/__hybrid/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }, session),
    );
  } catch (error) {
    return backendFailure(error);
  }
}
