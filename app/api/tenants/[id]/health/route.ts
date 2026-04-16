import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { proxyToBot, resolveBotTarget } from '@/lib/bot-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const target = await resolveBotTarget(params.id, userId);
  if (!target) {
    return NextResponse.json(
      { error: 'tenant not ready' },
      { status: 404 }
    );
  }

  return proxyToBot({ target, path: '/api/health', method: 'GET' });
}
