import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { proxyToBot, resolveBotTarget } from '@/lib/bot-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
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

  const searchParams = new URL(req.url).searchParams.toString();

  return proxyToBot({
    target,
    path: '/api/performance',
    method: 'GET',
    searchParams,
  });
}
