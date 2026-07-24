import { NextResponse } from 'next/server';

import { getResearchPersistenceProbe, getWebResearchRuntime } from '@/lib/research-runtime';

export async function GET() {
  const runtime = await getWebResearchRuntime();
  if (runtime.provider !== 'postgres') {
    return NextResponse.json(
      { ok: false, error: 'requires_postgres_provider', provider: runtime.provider },
      { status: 400 },
    );
  }
  const tables = await getResearchPersistenceProbe();
  return NextResponse.json({
    ok: true,
    provider: runtime.provider,
    tables,
  });
}
