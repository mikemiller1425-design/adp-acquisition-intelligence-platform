import { createServer } from 'node:http';
import { buildHealthResponse } from '@adp/platform';

async function main() {
  const payload = buildHealthResponse({
    service: 'web',
    status: 'ok',
    dependencies: [{ name: 'shell', status: 'ok' }],
  });

  const server = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind smoke server');
  }

  const response = await fetch(`http://127.0.0.1:${address.port}/health`);
  if (!response.ok) {
    throw new Error(`Web health smoke failed: ${response.status}`);
  }
  const body = (await response.json()) as { service: string };
  if (body.service !== 'web') {
    throw new Error(`Unexpected web health payload: ${JSON.stringify(body)}`);
  }
  console.log('Web health smoke OK');
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
