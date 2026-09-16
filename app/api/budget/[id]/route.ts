import { backendFailure, fetchFromPC, forwardPCResponse } from '@/lib/backend';
import { sessionToken, unauthenticatedResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = sessionToken(request);
  if (!session) return unauthenticatedResponse();
  try {
    const { id } = await context.params;
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) {
      return Response.json({ error: 'Invalid price-list selection.' }, { status: 400 });
    }
    return forwardPCResponse(await fetchFromPC(`/__hybrid/budget/${encodeURIComponent(id)}`, {}, session));
  } catch (error) {
    return backendFailure(error);
  }
}
