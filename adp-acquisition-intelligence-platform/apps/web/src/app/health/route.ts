import { buildHealthResponse } from '@adp/platform';

export const dynamic = 'force-dynamic';

export async function GET() {
  const body = buildHealthResponse({
    service: 'web',
    status: 'ok',
    dependencies: [{ name: 'next', status: 'ok', detail: 'app router shell' }],
  });
  return Response.json(body);
}
