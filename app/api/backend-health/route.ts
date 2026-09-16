import { backendFailure, fetchFromPC, forwardPCResponse } from '@/lib/backend';
import { sessionToken, unauthenticatedResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = sessionToken(request);
  if (!session) return unauthenticatedResponse();
  try {
    return forwardPCResponse(await fetchFromPC('/__hybrid/health', {}, session));
  } catch (error) {
    return backendFailure(error);
  }
}
