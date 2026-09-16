import { validateSession, unauthenticatedResponse } from '@/lib/auth';
import { backendFailure } from '@/lib/backend';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = await validateSession(request);
    if (!session) return unauthenticatedResponse();
    return Response.json(
      { authenticated: true, username: session.username },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return backendFailure(error);
  }
}
